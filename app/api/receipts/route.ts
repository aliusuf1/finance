import { verifyToken } from "@clerk/backend";
import { z } from "zod";
import { getSupabaseAdmin } from "../../../lib/supabase-server";

const transactionSchema = z.object({
  receiverName: z.string().trim().min(1).max(120),
  amountMinor: z.number().int().positive().max(1_000_000_000_00),
  currency: z.literal("PKR").default("PKR"),
  direction: z.enum(["outgoing", "incoming"]),
  kind: z.enum(["transfer_out", "atm", "bank_fee", "card", "transfer_in", "other"]),
  occurredAt: z.string().trim().max(100).optional().default(""),
  transactionId: z.string().trim().max(100).optional().default(""),
  channel: z.string().trim().max(60).optional().default(""),
  accountMasked: z.string().trim().max(60).optional().default(""),
  purposeNote: z.string().trim().max(500).optional().default(""),
  sourceName: z.string().trim().max(255).optional().default(""),
  rawText: z.string().max(12000).optional().default(""),
});

const postSchema = z.object({ transactions: z.array(transactionSchema).min(1).max(50) });

function toPublic(row: Record<string, unknown>) {
  return {
    id: row.id,
    receiverName: row.receiver_name,
    amountMinor: row.amount_minor,
    currency: row.currency,
    direction: row.direction,
    kind: row.kind,
    occurredAt: row.occurred_at,
    transactionId: row.transaction_id,
    channel: row.channel,
    accountMasked: row.account_masked,
    purposeNote: row.purpose_note,
    sourceName: row.source_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function requestJson(request: Request) {
  try { return await request.json() as unknown; } catch { return null; }
}

async function clerkUserId(request: Request) {
  const header = request.headers.get("authorization");
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!token || !secretKey) return null;
  try {
    const payload = await verifyToken(token, { secretKey });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function dbError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("SUPABASE_NOT_CONFIGURED")) return "Supabase is not configured yet. Add the project URL and server secret, then restart Hisab.";
  if (/relation .*transactions.* does not exist/i.test(message)) return "The Supabase transaction table is not ready. Run the included migration and retry.";
  return "Hisab could not access your private transaction records. Please try again.";
}

export async function GET(request: Request) {
  try {
    const userId = await clerkUserId(request);
    if (!userId) return Response.json({ error: "Sign in to view your transactions." }, { status: 401 });
    const { data, error } = await getSupabaseAdmin().from("transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(500);
    if (error) throw error;
    return Response.json({ receipts: (data || []).map(toPublic), capped: (data?.length || 0) === 500 });
  } catch (error) {
    return Response.json({ error: dbError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await clerkUserId(request);
    if (!userId) return Response.json({ error: "Sign in to save transactions." }, { status: 401 });
    const parsed = postSchema.safeParse(await requestJson(request));
    if (!parsed.success) return Response.json({ error: "Review the extracted transactions and amounts, then try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    const now = new Date().toISOString();
    const values = parsed.data.transactions.map((item) => ({
      user_id: userId,
      receiver_name: item.receiverName,
      amount_minor: item.amountMinor,
      currency: item.currency,
      direction: item.direction,
      kind: item.kind,
      occurred_at: item.occurredAt || null,
      transaction_id: item.transactionId || null,
      channel: item.channel || null,
      account_masked: item.accountMasked || null,
      purpose_note: item.purposeNote,
      source_name: item.sourceName || null,
      raw_text: item.rawText,
      created_at: now,
      updated_at: now,
    }));
    const { data, error } = await getSupabaseAdmin().from("transactions").insert(values).select("*");
    if (error) throw error;
    return Response.json({ receipts: (data || []).map(toPublic) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: dbError(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await clerkUserId(request);
    if (!userId) return Response.json({ error: "Sign in to update a transaction." }, { status: 401 });
    const parsed = z.object({ id: z.string().uuid(), purposeNote: z.string().trim().max(500) }).safeParse(await requestJson(request));
    if (!parsed.success) return Response.json({ error: "The note is too long or the transaction is invalid." }, { status: 400 });
    const { data, error } = await getSupabaseAdmin().from("transactions").update({ purpose_note: parsed.data.purposeNote, updated_at: new Date().toISOString() }).eq("id", parsed.data.id).eq("user_id", userId).select("*").maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "Transaction not found." }, { status: 404 });
    return Response.json({ receipt: toPublic(data) });
  } catch (error) {
    return Response.json({ error: dbError(error) }, { status: 500 });
  }
}
