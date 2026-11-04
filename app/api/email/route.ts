import { z } from "zod";
import { authenticatedUserId, isSameOrigin } from "../../../lib/request-auth";
import { beginGmailConnection, callbackUrl, clearGmailSession, freshGmailSession, gmailConfigured, GmailError, gmailSessionCookie, readGmailSession, revokeGmail } from "../../../lib/gmail-session";
import { emailImportKey, emailReceiptId, listBankDebits, readBankMessages } from "../../../lib/gmail-import";
import { currentPakistanMonth } from "../../../lib/bank-email-parser";
import { getSupabaseAdmin } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect") }).strict(),
  z.object({ action: z.literal("disconnect") }).strict(),
  z.object({ action: z.literal("preview"), pageToken: z.string().max(2048).optional(), month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).strict(),
  z.object({ action: z.literal("import"), messageIds: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,256}$/)).min(1).max(50), month: z.string().regex(/^\d{4}-\d{2}$/) }).strict(),
  z.object({
    action: z.literal("import_unclear"),
    messageId: z.string().regex(/^[a-zA-Z0-9_-]{1,256}$/),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    receiverName: z.string().trim().min(1).max(120),
    amountMinor: z.number().int().positive().max(100_000_000_000),
  }).strict(),
]);
function json(data: unknown, status = 200, cookie?: string) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store", ...(cookie ? { "Set-Cookie": cookie } : {}) } });
}
function failure(error: unknown) {
  return error instanceof GmailError ? json({ error: error.message, reconnect: error.reconnect }, error.status) : json({ error: "The email import could not finish. Nothing further was imported. Please retry." }, 502);
}

export async function GET(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return json({ error: "Sign in to connect Gmail." }, 401);
  const session = await readGmailSession(request, userId);
  return json({ configured: gmailConfigured(), connected: !!session, email: session?.email ?? null, month: currentPakistanMonth().key, callbackUrl: callbackUrl(request) });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "Open this action from Hisab." }, 403);
  const userId = await authenticatedUserId(request);
  if (!userId) return json({ error: "Sign in to import your bank alerts." }, 401);
  let input;
  try { input = actionSchema.safeParse(await request.json()); } catch { return json({ error: "Invalid request." }, 400); }
  if (!input.success) return json({ error: "Invalid email import request." }, 400);
  try {
    if (input.data.action === "connect") {
      const result = await beginGmailConnection(request, userId);
      return json({ url: result.url }, 200, result.cookie);
    }
    const existing = await readGmailSession(request, userId);
    if (input.data.action === "disconnect") {
      if (existing) await revokeGmail(existing);
      return json({ connected: false }, 200, clearGmailSession(request));
    }
    if (!existing) throw new GmailError("Connect Gmail before importing bank alerts.", 401, true);
    if (input.data.month && input.data.month !== currentPakistanMonth().key) return json({ error: "The month has changed. Fetch this month's alerts again." }, 409);
    const session = await freshGmailSession(existing);
    const sessionCookie = await gmailSessionCookie(request, session);
    if (input.data.action === "preview") {
      const result = await listBankDebits(session, input.data.pageToken);
      const transactions = await Promise.all(result.transactions.map(async (item) => ({ ...item, id: await emailReceiptId(userId, session.email, emailImportKey(item)) })));
      const unclear = await Promise.all(result.unclear.map(async (item) => ({ ...item, id: await emailReceiptId(userId, session.email, item.messageId) })));
      let savedIds = new Set<string>();
      const candidateIds = [...transactions.map((item) => item.id), ...unclear.map((item) => item.id)];
      if (candidateIds.length) {
        const { data, error } = await getSupabaseAdmin().from("transactions").select("id").eq("user_id", userId).in("id", candidateIds);
        if (error) throw error;
        savedIds = new Set((data ?? []).map((row) => row.id));
      }
      return json({ ...result, transactions: transactions.filter((item) => !savedIds.has(item.id)), unclear: unclear.filter((item) => !savedIds.has(item.id)), alreadyImported: savedIds.size }, 200, sessionCookie);
    }
    // Re-read and revalidate Gmail messages. Manual amounts are accepted only for a message
    // that the server independently confirms is a current-month debit with an unclear amount.
    if (input.data.action === "import_unclear") {
      const messageId = input.data.messageId;
      const result = await readBankMessages(session, [messageId]);
      const review = result.unclear.find((item) => item.messageId === messageId);
      if (!review) return json({ error: "This alert is no longer an unclear current-month debit. Fetch this month's alerts again." }, 409, sessionCookie);
      const item = {
        messageId: review.messageId, bank: review.bank, receiverName: input.data.receiverName.trim(),
        amountMinor: input.data.amountMinor, currency: "PKR" as const, direction: "outgoing" as const,
        kind: review.kind, occurredAt: review.occurredAt, transactionId: review.transactionId,
        channel: review.channel, accountMasked: review.accountMasked, purposeNote: "", sourceName: review.sourceName,
      };
      const now = new Date().toISOString();
      const id = await emailReceiptId(userId, session.email, review.messageId);
      const { data, error } = await getSupabaseAdmin().from("transactions").upsert({
        id, user_id: userId, receiver_name: item.receiverName, amount_minor: item.amountMinor, currency: item.currency,
        direction: item.direction, kind: item.kind, occurred_at: item.occurredAt, transaction_id: item.transactionId || null,
        channel: item.channel, account_masked: item.accountMasked || null, purpose_note: "", source_name: item.sourceName,
        raw_text: "", created_at: now, updated_at: now,
      }, { onConflict: "id", ignoreDuplicates: true }).select("id");
      if (error) throw error;
      return json({ imported: data?.length ?? 0, alreadyImported: data?.length ? 0 : 1, month: result.month }, 200, sessionCookie);
    }
    // Standard imports never trust browser-supplied transaction values.
    const result = await readBankMessages(session, [...new Set(input.data.messageIds)]);
    const now = new Date().toISOString();
    const values = await Promise.all(result.transactions.map(async (item) => ({
      id: await emailReceiptId(userId, session.email, emailImportKey(item)), user_id: userId,
      receiver_name: item.receiverName, amount_minor: item.amountMinor, currency: item.currency,
      direction: "outgoing", kind: item.kind, occurred_at: item.occurredAt,
      transaction_id: item.transactionId || null, channel: item.channel, account_masked: item.accountMasked || null,
      purpose_note: "", source_name: item.sourceName, raw_text: "", created_at: now, updated_at: now,
    })));
    if (!values.length) return json({ imported: 0, skipped: result.skipped, month: result.month }, 200, sessionCookie);
    const { data, error } = await getSupabaseAdmin().from("transactions").upsert(values, { onConflict: "id", ignoreDuplicates: true }).select("id");
    if (error) throw error;
    return json({ imported: data?.length ?? 0, alreadyImported: values.length - (data?.length ?? 0), skipped: result.skipped, month: result.month }, 200, sessionCookie);
  } catch (error) { return failure(error); }
}
