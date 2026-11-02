import { and, count, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../db";
import { receipts, users } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

const receiptSchema = z.object({
  receiverName: z.string().trim().min(1).max(120),
  amountMinor: z.number().int().positive().max(1_000_000_000_00),
  currency: z.literal("PKR").default("PKR"),
  occurredAt: z.string().trim().max(100).optional().default(""),
  transactionId: z.string().trim().max(100).optional().default(""),
  channel: z.string().trim().max(60).optional().default(""),
  accountMasked: z.string().trim().max(60).optional().default(""),
  purposeNote: z.string().trim().max(500).optional().default(""),
  sourceName: z.string().trim().max(255).optional().default(""),
  rawText: z.string().max(12000).optional().default(""),
});

const publicReceiptColumns = {
  id: receipts.id, receiverName: receipts.receiverName, amountMinor: receipts.amountMinor,
  currency: receipts.currency, occurredAt: receipts.occurredAt, transactionId: receipts.transactionId,
  channel: receipts.channel, accountMasked: receipts.accountMasked, purposeNote: receipts.purposeNote,
  sourceName: receipts.sourceName, createdAt: receipts.createdAt, updatedAt: receipts.updatedAt,
};

async function requestJson(request: Request) {
  try { return await request.json() as unknown; } catch { return null; }
}

async function authenticatedDbUser() {
  const identity = await getChatGPTUser();
  if (!identity) return null;
  const db = getDb();
  await db.insert(users).values({ id: identity.userId, email: identity.email, displayName: identity.displayName }).onConflictDoUpdate({ target: users.id, set: { email: identity.email, displayName: identity.displayName, updatedAt: new Date().toISOString() } });
  return { db, identity };
}

function dbError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected database error";
  return message.includes("no such table") ? "The receipt database is not ready yet. Please retry after the deployment finishes." : "Hisab could not access your receipt records. Please try again.";
}

export async function GET() {
  try {
    const auth = await authenticatedDbUser();
    if (!auth) return Response.json({ error: "Sign in to view your receipts." }, { status: 401 });
    const rows = await auth.db.select(publicReceiptColumns).from(receipts).where(eq(receipts.userId, auth.identity.userId)).orderBy(desc(receipts.createdAt)).limit(200);
    return Response.json({ user: { displayName: auth.identity.displayName, email: auth.identity.email }, receipts: rows, capped: rows.length === 200 });
  } catch (error) {
    return Response.json({ error: dbError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticatedDbUser();
    if (!auth) return Response.json({ error: "Sign in to save a receipt." }, { status: 401 });
    const parsed = receiptSchema.safeParse(await requestJson(request));
    if (!parsed.success) return Response.json({ error: "Check the receiver name and amount, then try again.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const [recent] = await auth.db.select({ value: count() }).from(receipts).where(and(eq(receipts.userId, auth.identity.userId), gt(receipts.createdAt, cutoff)));
    if ((recent?.value ?? 0) >= 20) return Response.json({ error: "Too many receipts were saved in one minute. Wait a moment and try again." }, { status: 429 });
    const now = new Date().toISOString();
    const [receipt] = await auth.db.insert(receipts).values({ id: crypto.randomUUID(), userId: auth.identity.userId, ...parsed.data, createdAt: now, updatedAt: now }).returning(publicReceiptColumns);
    return Response.json({ receipt }, { status: 201 });
  } catch (error) {
    return Response.json({ error: dbError(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticatedDbUser();
    if (!auth) return Response.json({ error: "Sign in to update a receipt." }, { status: 401 });
    const parsed = z.object({ id: z.string().uuid(), purposeNote: z.string().trim().max(500) }).safeParse(await requestJson(request));
    if (!parsed.success) return Response.json({ error: "The note is too long or the receipt is invalid." }, { status: 400 });
    const [receipt] = await auth.db.update(receipts).set({ purposeNote: parsed.data.purposeNote, updatedAt: new Date().toISOString() }).where(and(eq(receipts.id, parsed.data.id), eq(receipts.userId, auth.identity.userId))).returning(publicReceiptColumns);
    if (!receipt) return Response.json({ error: "Receipt not found." }, { status: 404 });
    return Response.json({ receipt });
  } catch (error) {
    return Response.json({ error: dbError(error) }, { status: 500 });
  }
}
