import type { TransactionKind } from "./receipt-parser";

export type Bank = "meezan" | "hbl";
export type BankAlertSenders = Record<Bank, string[]>;
export const BANK_ALERT_SENDERS: BankAlertSenders = {
  meezan: ["no-reply@meezanbank.com"],
  hbl: ["digital.banking@hbl.com"],
};
export type BankEmail = {
  messageId: string;
  from: string;
  subject: string;
  /** Plain text decoded by the email provider adapter; never rendered as HTML. */
  text: string;
};

export type BankEmailTransaction = {
  messageId: string;
  bank: Bank;
  receiverName: string;
  amountMinor: number;
  currency: "PKR";
  direction: "outgoing";
  kind: TransactionKind;
  occurredAt: string;
  transactionId: string;
  channel: string;
  accountMasked: string;
  purposeNote: string;
  sourceName: string;
};

export type BankEmailReviewCandidate = Omit<BankEmailTransaction, "amountMinor" | "currency" | "direction" | "purposeNote"> & {
  subject: string;
  amountOptions: number[];
  excerpt: string;
};

type ParseResult = { transaction: BankEmailTransaction; skipped?: never } | {
  transaction?: never;
  skipped: "sender" | "not_debit" | "date_unclear" | "outside_month" | "amount_unclear";
  review?: BankEmailReviewCandidate;
};

const bankNames: Record<Bank, string> = { meezan: "Meezan Bank Alert", hbl: "HBL Digital Banking" };
const pakistanOffsetMs = 5 * 60 * 60 * 1000;

/** Half-open month boundaries in Asia/Karachi, independent of the server timezone. */
export function currentPakistanMonth(now = new Date()) {
  const local = new Date(now.getTime() + pakistanOffsetMs);
  const year = local.getUTCFullYear(), month = local.getUTCMonth();
  return {
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
    start: new Date(Date.UTC(year, month, 1) - pakistanOffsetMs),
    end: new Date(Date.UTC(year, month + 1, 1) - pakistanOffsetMs),
  };
}

function senderAddress(from: string) {
  const value = from.trim();
  const address = value.match(/^[^<>]*<([^<>]+)>$/)?.[1] ?? value;
  return /^[^\s<>@,]+@[^\s<>@,]+\.[^\s<>@,]+$/.test(address) ? address.toLowerCase() : "";
}

function transactionDate(text: string): string | null {
  // Require a transaction date, not the arrival time of a delayed bank email.
  const matches = [...text.matchAll(/(?:\b(?:transaction\s+)?date(?:\s*(?:&|and)\s*time)?\s*[:\-]?|\bon)\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\s/\-](?:\d{1,2}|[A-Za-z]{3,9})[\s,/\-]+\d{4})\b/gi)];
  const dates = new Set<string>();
  for (const match of matches) {
    const parts = match[1].split(/[\s,/\-]+/);
    const yearFirst = parts[0].length === 4;
    const year = Number(yearFirst ? parts[0] : parts[2]);
    const day = Number(yearFirst ? parts[2] : parts[0]);
    const monthText = parts[1].toLowerCase();
    const month = /^\d+$/.test(monthText) ? Number(monthText) : ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(monthText.slice(0, 3)) + 1;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    dates.add(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return dates.size === 1 ? [...dates][0] : null;
}

function debitAmounts(text: string): number[] {
  // Remove balance clauses so an available balance cannot become the transaction amount.
  const withoutBalances = text.replace(/\b(?:available|remaining|closing|current|opening)?\s*balance\b[^\n;]*/gi, "");
  const amounts = [...withoutBalances.matchAll(/(?:PKR|Rs\.?)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)(?![\d,]|\.\d)/gi)];
  return [...new Set(amounts.map((match) => Math.round(Number(match[1].replaceAll(",", "")) * 100)))]
    .filter((amount) => Number.isSafeInteger(amount) && amount > 0 && amount <= 100_000_000_000);
}

function transactionDetails(bank: Bank, email: BankEmail, body: string, date: string) {
  const text = `${email.subject}\n${body}`;
  const kind: TransactionKind = /\bATM\b|cash\s+withdraw/i.test(text) ? "atm" : /\b(?:bank\s+fee|bank\s+charges)\b/i.test(text) ? "bank_fee" : /\b(?:purchase|POS|merchant)\b/i.test(text) ? "card" : /\b(?:transfer|Raast|IBFT)\b/i.test(text) ? "transfer_out" : "other";
  const labelledName = body.match(/(?:(?:beneficiary|receiver)(?:\s+(?:account\s+)?(?:title|name))?|merchant(?:\s+name)?|paid\s+to|terminal\s+name)\s*:[\s:]*([^\n;:]+)/i)?.[1];
  const sentTo = body.match(/\bsent\s+to\s+(.+?)\s+(?:on|from)\s+(?:your\s+)?account\b/i)?.[1]?.replace(/\s*\([^)]*$/, "");
  const receiverName = (labelledName || sentTo)?.trim().slice(0, 120) || `${bankNames[bank]} debit`;
  const time = body.match(/(?:transaction\s+time\s*:[\s:]*|date\s+(?:and|&)\s+time\s*:[\s:]*[^\n]*?\b)(\d{1,2}:\d{2})(?::\d{2})?\b/i)?.[1];
  const validTime = time && Number(time.split(":")[0]) < 24 && Number(time.split(":")[1]) < 60 ? time.padStart(5, "0") : "";
  return {
    messageId: email.messageId, bank, receiverName, kind,
    occurredAt: date + (validTime ? ` · ${validTime}` : ""),
    transactionId: body.match(/(?:transaction|reference|trx)\s*(?:ID|number|no\.?)\s*[:#-]\s*([\w-]+)/i)?.[1]?.slice(0, 100) ?? "",
    channel: /\bRaast\b/i.test(text) ? "Raast" : /\bIBFT\b/i.test(text) ? "Bank transfer" : kind === "atm" ? "ATM" : kind === "card" ? "Card" : bank === "hbl" ? "HBL" : "Meezan",
    accountMasked: body.match(/(?:[*xX•]{1,}\s*\d{3,4})\b/)?.[0] ?? "",
    sourceName: `${bankNames[bank]} email`,
  };
}

function reviewExcerpt(body: string) {
  const useful = body.split("\n").map((line) => line.trim()).filter((line) =>
    line && /\b(?:PKR|Rs\.?|amount|debit|date|time|beneficiary|receiver|merchant|transaction|reference|account|ATM|Raast)\b/i.test(line));
  return (useful.length ? useful : body.split("\n").map((line) => line.trim()).filter(Boolean)).slice(0, 12).join("\n").slice(0, 2000);
}

export function parseBankDebitEmail(email: BankEmail, senders: BankAlertSenders, now = new Date()): ParseResult {
  const from = senderAddress(email.from);
  const banks = (["meezan", "hbl"] as const).filter((bank) => from && senders[bank].some((allowed) => senderAddress(allowed) === from));
  // Ambiguous/shared sender configuration is not sufficient to identify a bank.
  if (banks.length !== 1) return { skipped: "sender" };
  const bank = banks[0];
  const body = email.text.replace(/\r/g, "").slice(0, 100_000);
  const text = `${email.subject}\n${body}`;
  const creditOrFailure = /\b(?:credited|refund(?:ed)?|revers(?:al|ed)|declined|failed|unsuccessful|cancelled)\b|\bfunds?\s+(?:received|receipt)\b|\btransaction\s+type\s*:\s*credit\b/i;
  const definiteDebit = /\bdebited\b|\bdebit\s+(?:transaction|alert|notification)\b|\btransaction\s+type\s*:\s*debit\b|\bcash\s+withdrawal\s+(?:successful|completed)\b/i;
  // HBL's observed outgoing-transfer template does not use the word "debit".
  const hblTransfer = bank === "hbl" && /\btransfer\s+to\s+(?:other\s+bank|HBL|own\s+account)\b/i.test(email.subject)
    && /your\s+funds\s+transfer\s+was\s+successful/i.test(body) && /receiver\s+account\s+title/i.test(body) && /from\s+acc(?:ount|\.no)/i.test(body);
  if (creditOrFailure.test(text) || (!definiteDebit.test(text) && !hblTransfer) || /\b(?:OTP|one.time.password|verification.code)\b/i.test(email.subject)) return { skipped: "not_debit" };
  const date = transactionDate(body);
  if (!date) return { skipped: "date_unclear" };
  if (!date.startsWith(`${currentPakistanMonth(now).key}-`)) return { skipped: "outside_month" };
  const details = transactionDetails(bank, email, body, date);
  const amountOptions = debitAmounts(body);
  if (amountOptions.length !== 1) return { skipped: "amount_unclear", review: {
    ...details, subject: email.subject.slice(0, 200), amountOptions, excerpt: reviewExcerpt(body),
  } };
  return { transaction: {
    ...details, amountMinor: amountOptions[0], currency: "PKR", direction: "outgoing", purposeNote: "",
  } };
}

export function collectBankDebits(emails: BankEmail[], senders: BankAlertSenders, now = new Date()) {
  const transactions: BankEmailTransaction[] = [];
  const unclear: BankEmailReviewCandidate[] = [];
  const skipped: Record<string, number> = {};
  const seenMessages = new Set<string>();
  const seenReferences = new Set<string>();
  for (const email of emails) {
    if (seenMessages.has(email.messageId)) { skipped.duplicate = (skipped.duplicate ?? 0) + 1; continue; }
    seenMessages.add(email.messageId);
    const result = parseBankDebitEmail(email, senders, now);
    if (result.skipped) {
      skipped[result.skipped] = (skipped[result.skipped] ?? 0) + 1;
      if (result.review) unclear.push(result.review);
      continue;
    }
    const row = result.transaction;
    const referenceKey = row.transactionId ? `${row.bank}:${row.transactionId}:${row.occurredAt}:${row.amountMinor}` : "";
    if (referenceKey && seenReferences.has(referenceKey)) { skipped.duplicate = (skipped.duplicate ?? 0) + 1; continue; }
    if (referenceKey) seenReferences.add(referenceKey);
    transactions.push(row);
  }
  return { transactions, unclear, skipped, month: currentPakistanMonth(now).key };
}
