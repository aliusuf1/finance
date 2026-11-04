import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const module = { exports: {} };
const source = ts.transpileModule(readFileSync(new URL("../lib/bank-email-parser.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function("module", "exports", source)(module, module.exports);
const { currentPakistanMonth, parseBankDebitEmail, collectBankDebits } = module.exports;
// Synthetic fixtures. Real bank formats must be checked after mailbox authorization.
const senders = { meezan: ["meezan-alerts@example.test"], hbl: ["hbl-alerts@example.test"] };
const now = new Date("2026-11-03T15:00:00Z");
const email = {
  messageId: "message-1", from: '"Meezan Bank Alert" <meezan-alerts@example.test>',
  subject: "Debit transaction alert",
  text: "Your account xx1234 was debited PKR 1,250.50.\nTransaction Date: 03-Nov-2026\nBeneficiary: Test Merchant\nTransaction ID: REF123\nAvailable balance: PKR 10,000.00",
};

test("Pakistan month boundaries use local midnight and handle year rollover", () => {
  const month = currentPakistanMonth(new Date("2026-10-31T19:00:00Z"));
  assert.equal(month.key, "2026-11");
  assert.equal(month.start.toISOString(), "2026-10-31T19:00:00.000Z");
  assert.equal(month.end.toISOString(), "2026-11-30T19:00:00.000Z");
  assert.equal(currentPakistanMonth(new Date("2026-10-31T18:59:59Z")).key, "2026-10");
  assert.equal(currentPakistanMonth(new Date("2026-12-31T19:00:00Z")).key, "2027-01");
});

test("only exact configured senders are accepted, not display names or lookalike domains", () => {
  for (const from of ['Meezan Bank Alert <unrelated@example.test>', 'meezan-alerts@example.test.evil.test', 'HBL Digital Banking <attacker@example.test>']) {
    assert.equal(parseBankDebitEmail({ ...email, from }, senders, now).skipped, "sender");
  }
  assert.equal(parseBankDebitEmail(email, { meezan: [], hbl: [] }, now).skipped, "sender");
});

test("parses a current-month debit and ignores the available balance", () => {
  const { transaction } = parseBankDebitEmail(email, senders, now);
  assert.equal(transaction.amountMinor, 125050);
  assert.equal(transaction.direction, "outgoing");
  assert.equal(transaction.occurredAt, "2026-11-03");
  assert.equal(transaction.receiverName, "Test Merchant");
  assert.equal(transaction.accountMasked, "xx1234");
  assert.equal(transaction.transactionId, "REF123");
  assert.ok(!("rawText" in transaction));
});

test("both supported bank sources use the same debit-only restrictions", () => {
  const result = parseBankDebitEmail({ ...email, from: 'HBL Digital Banking <hbl-alerts@example.test>' }, senders, now);
  assert.equal(result.transaction.bank, "hbl");
  assert.equal(result.transaction.sourceName, "HBL Digital Banking email");
});

test("credits, reversals, unsuccessful transactions, OTPs and debit-card advertising are excluded", () => {
  for (const text of ["Your account was credited PKR 100", "Funds received PKR 100", `${email.text}\nTransaction reversed`, `${email.text}\nTransaction failed`, "Get a new debit card for PKR 100"]) {
    assert.equal(parseBankDebitEmail({ ...email, subject: "Bank alert", text }, senders, now).skipped, "not_debit");
  }
  assert.equal(parseBankDebitEmail({ ...email, subject: "OTP for debit transaction" }, senders, now).skipped, "not_debit");
});

test("the transaction date, not the email's arrival month, controls inclusion", () => {
  for (const date of ["31-Oct-2026", "01-Dec-2026", "03-Nov-2025"]) {
    assert.equal(parseBankDebitEmail({ ...email, text: email.text.replace("03-Nov-2026", date) }, senders, now).skipped, "outside_month");
  }
});

test("missing, conflicting and impossible dates are skipped", () => {
  for (const text of [email.text.replace("03-Nov-2026", "unknown"), email.text.replace("03-Nov-2026", "31-Nov-2026"), `${email.text}\nDate: 04-Nov-2026`]) {
    assert.equal(parseBankDebitEmail({ ...email, text }, senders, now).skipped, "date_unclear");
  }
});

test("ambiguous, absent and zero transaction amounts are skipped", () => {
  for (const text of [`${email.text}\nFee: PKR 35.00`, email.text.replace("PKR 1,250.50", "amount unknown"), email.text.replace("PKR 1,250.50", "PKR 0.00")]) {
    assert.equal(parseBankDebitEmail({ ...email, text }, senders, now).skipped, "amount_unclear");
  }
});

test("ambiguous amounts return a bounded review candidate instead of guessing", () => {
  const result = parseBankDebitEmail({ ...email, text: `${email.text}\nFee: PKR 35.00` }, senders, now);
  assert.equal(result.skipped, "amount_unclear");
  assert.deepEqual(result.review.amountOptions, [125050, 3500]);
  assert.equal(result.review.receiverName, "Test Merchant");
  assert.equal(result.review.subject, "Debit transaction alert");
  assert.match(result.review.excerpt, /PKR 1,250\.50/);
  assert.ok(result.review.excerpt.length <= 2000);
  assert.ok(!("text" in result.review));
});

test("repeated messages and repeated bank transaction references are deduplicated within an import", () => {
  const result = collectBankDebits([email, email, { ...email, messageId: "message-2" }], senders, now);
  assert.equal(result.transactions.length, 1);
  assert.equal(result.skipped.duplicate, 2);
  assert.equal(result.month, "2026-11");
});

test("unclear alerts are returned separately from import-ready transactions", () => {
  const result = collectBankDebits([{ ...email, text: `${email.text}\nFee: PKR 35.00` }], senders, now);
  assert.equal(result.transactions.length, 0);
  assert.equal(result.unclear.length, 1);
  assert.equal(result.skipped.amount_unclear, 1);
});

test("observed Meezan transfer and Raast templates preserve the beneficiary and transaction time", () => {
  const transfer = parseBankDebitEmail({ ...email, text: "PKR 2,400.00 sent to TEST RECIPIENT (MBL AC on account xxx1234 with the following details:\nMode : Fund Transfer\nTransaction Date : 03-Nov-2026\nTransaction Time : 22:38" }, senders, now).transaction;
  assert.equal(transfer.receiverName, "TEST RECIPIENT");
  assert.equal(transfer.occurredAt, "2026-11-03 · 22:38");
  const raast = parseBankDebitEmail({ ...email, subject: "RAAST Debit Transaction Alert", text: "PKR 180.00 sent from your account xxx1234 with the following details:\nBeneficiary Account Title: : TEST RECIPIENT\nTransaction Date : 03-Nov-2026\nTransaction Time : 21:07" }, senders, now).transaction;
  assert.equal(raast.receiverName, "TEST RECIPIENT");
  assert.equal(raast.channel, "Raast");
});

test("observed HBL successful outgoing-transfer template is a debit even without that word", () => {
  const transaction = parseBankDebitEmail({ ...email, from: "hbl-alerts@example.test", subject: "HBL Mobile | Transfer to Other Bank", text: "Your funds transfer was successful. Transaction details are as follows:\nAmount: PKR 500\nReceiver Account Title: TEST RECIPIENT\nFrom Account Title: TEST SENDER\nFrom Acc.No/IBAN: *1234\nDate and Time: 01-Nov-2026 15:51\nChannel: via Raast\nTransaction ID: 1234567890" }, senders, now).transaction;
  assert.equal(transaction.direction, "outgoing");
  assert.equal(transaction.receiverName, "TEST RECIPIENT");
  assert.equal(transaction.occurredAt, "2026-11-01 · 15:51");
  assert.equal(transaction.accountMasked, "*1234");
  assert.equal(transaction.transactionId, "1234567890");
});
