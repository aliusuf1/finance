import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

// Exercise the real route handlers with isolated authentication and database boundaries.
const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL("../app/api/receipts/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const id = "f433706b-0ee9-46a3-9c4a-80bd2dcc88dd";

function fixture({ user = "owner", row = { id, purpose_note: "Updated" }, dbError = null } = {}) {
  const calls = [];
  const query = {};
  for (const method of ["from", "update", "delete", "eq", "select"]) {
    query[method] = (...args) => { calls.push([method, ...args]); return query; };
  }
  query.maybeSingle = async () => ({ data: row, error: dbError });
  const route = { exports: {} };
  const fakeRequire = (name) => {
    if (name === "@clerk/backend") return { verifyToken: async () => {
      if (!user) throw new Error("Invalid token");
      return { sub: user };
    } };
    if (name.includes("supabase-server")) return { getSupabaseAdmin: () => query };
    return require(name);
  };
  new Function("require", "module", "exports", "process", source)(fakeRequire, route, route.exports, { env: { CLERK_SECRET_KEY: "test-only" } });
  const request = (body, authenticated = true) => new Request("http://localhost/api/receipts", {
    method: "POST", headers: authenticated ? { authorization: "Bearer test-only" } : {}, body: JSON.stringify(body),
  });
  return { api: route.exports, calls, request };
}

test("editing a note preserves omitted receipt fields and scopes the update to its owner", async () => {
  const { api, calls, request } = fixture();
  const response = await api.PATCH(request({ id, purposeNote: " Updated " }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).receipt.purposeNote, "Updated");
  const values = calls.find(([method]) => method === "update")[1];
  assert.deepEqual(Object.keys(values).sort(), ["purpose_note", "updated_at"]);
  assert.equal(values.purpose_note, "Updated");
  assert.deepEqual(calls.filter(([method]) => method === "eq"), [["eq", "id", id], ["eq", "user_id", "owner"]]);
});

test("editing details maps validated fields and clears optional values without changing source data", async () => {
  const { api, calls, request } = fixture();
  const response = await api.PATCH(request({ id, receiverName: " Merchant ", amountMinor: 12345, direction: "incoming", kind: "transfer_in", occurredAt: "", transactionId: "new-id", channel: "Bank", accountMasked: "***1234", purposeNote: "" }));
  assert.equal(response.status, 200);
  const { updated_at, ...values } = calls.find(([method]) => method === "update")[1];
  assert.ok(updated_at);
  assert.deepEqual(values, { receiver_name: "Merchant", amount_minor: 12345, direction: "incoming", kind: "transfer_in", occurred_at: null, transaction_id: "new-id", channel: "Bank", account_masked: "***1234", purpose_note: "" });
});

test("invalid edits never reach the database", async () => {
  for (const body of [{ id }, { id, receiverName: " " }, { id, amountMinor: 0 }, { id, amountMinor: 1.5 }, { id, amountMinor: 100_000_000_001 }, { id, direction: "invalid" }, { id, purposeNote: "x".repeat(501) }, { id, user_id: "someone-else", purposeNote: "x" }, { id, sourceName: "replacement" }]) {
    const { api, calls, request } = fixture();
    assert.equal((await api.PATCH(request(body))).status, 400);
    assert.equal(calls.length, 0);
  }
});

for (const method of ["PATCH", "DELETE"]) {
  test(`${method} rejects missing and invalid authentication`, async () => {
    for (const authenticated of [false, true]) {
      const { api, calls, request } = fixture({ user: null });
      assert.equal((await api[method](request({ id, purposeNote: "test" }, authenticated))).status, 401);
      assert.equal(calls.length, 0);
    }
  });
  test(`${method} returns not found for absent or other-owner records`, async () => {
    const { api, calls, request } = fixture({ row: null });
    assert.equal((await api[method](request(method === "PATCH" ? { id, purposeNote: "test" } : { id }))).status, 404);
    assert.deepEqual(calls.filter(([method]) => method === "eq"), [["eq", "id", id], ["eq", "user_id", "owner"]]);
  });
  test(`${method} reports database failure without exposing internals`, async () => {
    const { api, request } = fixture({ dbError: new Error("private database details") });
    const response = await api[method](request(method === "PATCH" ? { id, purposeNote: "test" } : { id }));
    assert.equal(response.status, 500);
    assert.ok(!(await response.text()).includes("private database details"));
  });
}

test("deletion scopes the mutation to the owner and returns the deleted ID", async () => {
  const { api, calls, request } = fixture();
  const response = await api.DELETE(request({ id }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id });
  assert.deepEqual(calls, [["from", "transactions"], ["delete"], ["eq", "id", id], ["eq", "user_id", "owner"], ["select", "id"]]);
});

test("deletion rejects malformed identifiers before touching the database", async () => {
  const { api, calls, request } = fixture();
  assert.equal((await api.DELETE(request({ id: "invalid" }))).status, 400);
  assert.equal(calls.length, 0);
});
