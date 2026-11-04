import assert from "node:assert/strict";
import test from "node:test";
import { loadTestModule } from "./gmail-test-loader.mjs";

const nowMonth = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 7);
const transaction = { messageId: "abc123", bank: "meezan", receiverName: "Bank merchant", amountMinor: 10000, currency: "PKR", direction: "outgoing", kind: "card", occurredAt: `${nowMonth}-01`, transactionId: "REF123", channel: "Card", accountMasked: "xx1234", purposeNote: "", sourceName: "Meezan Bank Alert email" };

function fixture(user = "owner", unclear = []) {
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
      readBankMessages: async (_session, ids) => { calls.push(["read", ids]); return { transactions: unclear.length ? [] : [transaction], unclear, skipped: unclear.length ? { amount_unclear: unclear.length } : {}, month: nowMonth }; },
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

test("unclear imports re-read Gmail and save the reviewed amount as one transaction", async () => {
  const review = { messageId: "abc123", bank: "meezan", receiverName: "Meezan debit", kind: "transfer_out", occurredAt: `${nowMonth}-01`, transactionId: "REF123", channel: "Raast", accountMasked: "xx1234", sourceName: "Meezan Bank Alert email", subject: "Debit alert", amountOptions: [10000, 3500], excerpt: "PKR 100.00\nPKR 35.00" };
  const { api, calls, request } = fixture("owner", [review]);
  const response = await api.POST(request({ action: "import_unclear", messageId: "abc123", month: nowMonth, receiverName: "Corrected receiver", amountMinor: 10000 }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).imported, 1);
  assert.deepEqual(calls.find(([name]) => name === "read"), ["read", ["abc123"]]);
  assert.deepEqual(calls.find(([name]) => name === "id"), ["id", "owner", "owner@example.test", "abc123"]);
  const [, value, options] = calls.find(([name]) => name === "upsert");
  assert.deepEqual(options, { onConflict: "id", ignoreDuplicates: true });
  assert.equal(value.receiver_name, "Corrected receiver");
  assert.equal(value.amount_minor, 10000);
  assert.equal(value.raw_text, "");
});

test("manual correction is rejected unless the server still sees an unclear debit", async () => {
  const { api, calls, request } = fixture();
  const response = await api.POST(request({ action: "import_unclear", messageId: "abc123", month: nowMonth, receiverName: "Browser value", amountMinor: 1 }));
  assert.equal(response.status, 409);
  assert.equal(calls.some(([name]) => name === "upsert"), false);
});
