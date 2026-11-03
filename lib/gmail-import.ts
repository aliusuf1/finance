import { z } from "zod";
import { BANK_ALERT_SENDERS, collectBankDebits, currentPakistanMonth, type BankEmail, type BankEmailTransaction } from "./bank-email-parser";
import { GmailError, type GmailSession } from "./gmail-session";

const partSchema: z.ZodType<MimePart> = z.lazy(() => z.object({
  mimeType: z.string().optional(), filename: z.string().optional(), body: z.object({ data: z.string().optional() }).optional(),
  headers: z.array(z.object({ name: z.string(), value: z.string() })).optional(), parts: z.array(partSchema).optional(),
}));
type MimePart = { mimeType?: string; filename?: string; body?: { data?: string }; headers?: { name: string; value: string }[]; parts?: MimePart[] };
const messageSchema = z.object({ id: z.string(), internalDate: z.string(), payload: partSchema });

export function gmailBankQuery(now = new Date()) {
  const { start, end } = currentPakistanMonth(now);
  // Gmail's date strings use PST. Epoch seconds preserve the Pakistan month boundary.
  return `{from:${BANK_ALERT_SENDERS.meezan[0]} from:${BANK_ALERT_SENDERS.hbl[0]}} after:${Math.floor(start.getTime() / 1000) - 1} before:${Math.floor(end.getTime() / 1000)}`;
}

async function gmailGet(session: GmailSession, path: string) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` }, signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 401) throw new GmailError("Your Gmail connection expired. Reconnect Gmail.", 401, true);
  if (response.status === 429 || response.status === 403) throw new GmailError("Google limited this request or Gmail access is unavailable. Wait a minute and retry; check that the Gmail API is enabled.", 429);
  if (!response.ok) throw new GmailError("Gmail could not return the bank alerts. Please retry.");
  return response.json();
}

function decode(data = "") { return Buffer.from(data, "base64url").toString("utf8"); }
export function htmlEmailText(html: string) {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(?:p|div|tr|table|h[1-6])\s*>|<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/t[dh]\s*>/gi, ": ").replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&#(\d{1,7});/g, (_, value) => {
      const code = Number(value); return code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    }).replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n").trim();
}

function bodyText(part: MimePart): string {
  if (part.filename) return ""; // Never fetch or parse attachments.
  if (part.mimeType === "text/plain" && part.body?.data) return decode(part.body.data);
  if (part.mimeType === "text/html" && part.body?.data) return htmlEmailText(decode(part.body.data));
  const parts = part.parts ?? [];
  if (part.mimeType === "multipart/alternative") {
    const plain = parts.find((child) => child.mimeType === "text/plain" && !child.filename && child.body?.data);
    if (plain) return bodyText(plain);
    const html = parts.find((child) => child.mimeType === "text/html" && !child.filename);
    return html ? bodyText(html) : parts.map(bodyText).join("\n");
  }
  return parts.map(bodyText).join("\n");
}

export async function readBankMessages(session: GmailSession, ids: string[], now = new Date()) {
  const emails: BankEmail[] = [];
  const { start, end } = currentPakistanMonth(now);
  let outsideReceivedMonth = 0;
  for (let index = 0; index < ids.length; index += 5) {
    const messages = await Promise.all(ids.slice(index, index + 5).map(async (id) => messageSchema.parse(await gmailGet(session, `messages/${encodeURIComponent(id)}?format=full`))));
    for (const message of messages) {
      const received = Number(message.internalDate);
      if (!Number.isFinite(received) || received < start.getTime() || received >= end.getTime()) { outsideReceivedMonth++; continue; }
      const header = (name: string) => message.payload.headers?.find((item) => item.name.toLowerCase() === name)?.value ?? "";
      emails.push({ messageId: message.id, from: header("from"), subject: header("subject"), text: bodyText(message.payload) });
    }
  }
  const result = collectBankDebits(emails, BANK_ALERT_SENDERS, now);
  if (outsideReceivedMonth) result.skipped.outside_month = (result.skipped.outside_month ?? 0) + outsideReceivedMonth;
  return result;
}

export async function listBankDebits(session: GmailSession, pageToken?: string, now = new Date()) {
  const query = new URLSearchParams({ q: gmailBankQuery(now), maxResults: "50", includeSpamTrash: "false" });
  if (pageToken) query.set("pageToken", pageToken);
  const list = z.object({ messages: z.array(z.object({ id: z.string() })).optional(), nextPageToken: z.string().optional() }).parse(await gmailGet(session, `messages?${query}`));
  const ids = list.messages?.map((message) => message.id) ?? [];
  return { ...await readBankMessages(session, ids, now), scanned: ids.length, nextPageToken: list.nextPageToken ?? null };
}

export async function emailReceiptId(userId: string, emailAddress: string, messageId: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(["hisab-gmail-v1", userId, emailAddress.toLowerCase(), messageId]))));
  // Deterministic primary keys make repeated/concurrent imports safe without schema changes.
  digest[6] = (digest[6] & 0x0f) | 0x80;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = Buffer.from(digest.slice(0, 16)).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function emailImportKey(item: BankEmailTransaction) {
  return item.transactionId ? JSON.stringify([item.bank, item.transactionId, item.occurredAt, item.amountMinor, item.accountMasked.replaceAll(" ", "")]) : item.messageId;
}
