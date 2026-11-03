import assert from "node:assert/strict";
import test from "node:test";
import { loadTestModule } from "./gmail-test-loader.mjs";

const nowMonth = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 7);
const transaction = { messageId: "abc123", bank: "meezan", receiverName: "Bank merchant", amountMinor: 10000, currency: "PKR", direction: "outgoing", kind: "card", occurredAt: `${nowMonth}-01`, transactionId: "REF123", channel: "Card", accountMasked: "xx1234", purposeNote: "", sourceName: "Meezan Bank Alert email" };

function fixture(user = "owner") {
  const calls = [];
  const query = {
    from: (...args) => { calls.push(["from", ...args]); return query; },
    upsert: (...args) => { calls.push(["upsert", ...args]); return query; },
    select: async () => ({ data: [{ id: "stable-id" }], error: null }),
  };
  const api = loadTestModule("app/api/email/route.ts", { mocks: {
    "../../../lib/request-auth": { authenticatedUserId: async () => user, isSameOrigin: (request) => request.headers.get("origin") === new URL(request.url).origin },
    "../../../lib/gmail-session": {
      GmailError: class extends Error {},
      readGmailSession: async () => ({ userId: user, email: "owner@example.test" }),
      freshGmailSession: async (value) => value,
      gmailSessionCookie: async () => "test-cookie=value; HttpOnly",
    },
    "../../../lib/gmail-import": {
      readBankMessages: async (_session, ids) => { calls.push(["read", ids]); return { transactions: [transaction], skipped: {}, month: nowMonth }; },
      emailImportKey: (row) => row.transactionId,
      emailReceiptId: async (...args) => { calls.push(["id", ...args]); return "stable-id"; },
    },
    "../../../lib/supabase-server": { getSupabaseAdmin: () => query },
  } });
  const request = (body, origin = "https://hisab.example") => new Request("https://hisab.example/api/email", { method: "POST", headers: { Origin: origin }, body: JSON.stringify(body) });
  return { api, calls, request };
}

test("email imports require authentication and same-origin requests", async () => {
  const unauthorized = fixture(null);
  assert.equal((await unauthorized.api.POST(unauthorized.request({ action: "import", messageIds: ["abc123"], month: nowMonth }))).status, 401);
  assert.equal(unauthorized.calls.length, 0);
  const crossOrigin = fixture();
  assert.equal((await crossOrigin.api.POST(crossOrigin.request({ action: "import", messageIds: ["abc123"], month: nowMonth }, "https://attacker.example"))).status, 403);
  assert.equal(crossOrigin.calls.length, 0);
});

test("email imports reject browser-supplied amounts and stale months", async () => {
  const { api, calls, request } = fixture();
  assert.equal((await api.POST(request({ action: "import", messageIds: ["abc123"], month: nowMonth, amountMinor: 1 }))).status, 400);
  assert.equal((await api.POST(request({ action: "import", messageIds: ["abc123"], month: "2000-01" }))).status, 409);
  assert.equal(calls.length, 0);
});

test("imports re-read bank messages and ignore duplicate primary keys instead of overwriting notes", async () => {
  const { api, calls, request } = fixture();
  const response = await api.POST(request({ action: "import", messageIds: ["abc123", "abc123"], month: nowMonth }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).imported, 1);
  assert.deepEqual(calls.find(([name]) => name === "read"), ["read", ["abc123"]]);
  const [, values, options] = calls.find(([name]) => name === "upsert");
  assert.deepEqual(options, { onConflict: "id", ignoreDuplicates: true });
  assert.equal(values[0].user_id, "owner");
  assert.equal(values[0].amount_minor, 10000);
  assert.equal(values[0].direction, "outgoing");
  assert.equal(values[0].raw_text, "");
});
