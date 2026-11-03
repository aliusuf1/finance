import assert from "node:assert/strict";
import test from "node:test";
import { loadTestModule } from "./gmail-test-loader.mjs";

const now = new Date("2026-11-03T15:00:00Z");
const session = { accessToken: "test-token" };
const body = "Your account was debited PKR 250.00.\nDate: 03-Nov-2026\nMerchant: Test shop";
const encode = (value) => Buffer.from(value).toString("base64url");
const message = (id, payload = {}) => ({ id, internalDate: String(now.getTime()), payload: {
  mimeType: "text/plain", headers: [{ name: "From", value: "Meezan Bank Alert <no-reply@meezanbank.com>" }, { name: "Subject", value: "Debit transaction" }], body: { data: encode(body) }, ...payload,
} });

test("query restricts exact bank senders and Pakistan month boundaries", () => {
  const api = loadTestModule("lib/gmail-import.ts");
  const query = api.gmailBankQuery(now);
  assert.match(query, /\{from:no-reply@meezanbank.com from:digital.banking@hbl.com\}/);
  assert.ok(query.includes(`after:${Date.parse("2026-10-31T19:00:00Z") / 1000 - 1}`));
  assert.ok(query.includes(`before:${Date.parse("2026-11-30T19:00:00Z") / 1000}`));
});

test("Gmail reads are bounded and paginate; full messages stay on the server", async () => {
  const calls = [];
  const api = loadTestModule("lib/gmail-import.ts", { fetch: async (url, init) => {
    calls.push([url, init]);
    return Response.json(url.includes("messages?") ? { messages: [{ id: "abc123" }], nextPageToken: "next-page" } : message("abc123"));
  } });
  const result = await api.listBankDebits(session, undefined, now);
  assert.equal(result.transactions.length, 1);
  assert.equal(result.nextPageToken, "next-page");
  assert.equal(result.scanned, 1);
  assert.equal(new URL(calls[0][0]).searchParams.get("maxResults"), "50");
  assert.ok(calls.every(([url, init]) => url.startsWith("https://gmail.googleapis.com/gmail/v1/users/me/") && !init.method));
  assert.ok(!("text" in result.transactions[0]));
});

test("plain text takes priority over alternate HTML and attachments are not fetched", async () => {
  const api = loadTestModule("lib/gmail-import.ts", { fetch: async () => Response.json(message("abc123", { mimeType: "multipart/alternative", body: {}, parts: [
    { mimeType: "text/plain", body: { data: encode(body) } },
    { mimeType: "text/html", body: { data: encode("<p>Different amount PKR 999</p>") } },
    { mimeType: "text/plain", filename: "attachment.txt", body: { data: encode("PKR 888") } },
  ] })) });
  const result = await api.readBankMessages(session, ["abc123"], now);
  assert.equal(result.transactions[0].amountMinor, 25000);
});

test("HTML-only bank emails can be parsed without executing HTML", async () => {
  const api = loadTestModule("lib/gmail-import.ts", { fetch: async () => Response.json(message("abc123", { mimeType: "text/html", body: { data: encode("<style>PKR 500</style><p>Your account was debited PKR 250.00.</p><table><tr><td>Date</td><td>03-Nov-2026</td></tr><tr><td>Merchant</td><td>Test &amp; shop</td></tr></table>") } })) });
  const result = await api.readBankMessages(session, ["abc123"], now);
  assert.equal(result.transactions[0].amountMinor, 25000);
  assert.equal(result.transactions[0].occurredAt, "2026-11-03");
});

test("message timestamp is checked again even if an arbitrary ID is supplied", async () => {
  const api = loadTestModule("lib/gmail-import.ts", { fetch: async () => Response.json({ ...message("old"), internalDate: String(Date.parse("2026-10-01T00:00:00Z")) }) });
  const result = await api.readBankMessages(session, ["old"], now);
  assert.equal(result.transactions.length, 0);
  assert.equal(result.skipped.outside_month, 1);
});

test("idempotent IDs remain isolated by Hisab user and Gmail account", async () => {
  const api = loadTestModule("lib/gmail-import.ts");
  const id = await api.emailReceiptId("owner", "one@example.test", "message");
  assert.equal(id, await api.emailReceiptId("owner", "ONE@example.test", "message"));
  assert.notEqual(id, await api.emailReceiptId("another", "one@example.test", "message"));
  assert.notEqual(id, await api.emailReceiptId("owner", "two@example.test", "message"));
  assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});
