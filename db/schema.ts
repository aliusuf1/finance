import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const receipts = sqliteTable("receipts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  receiverName: text("receiver_name").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull().default("PKR"),
  occurredAt: text("occurred_at"),
  transactionId: text("transaction_id"),
  channel: text("channel"),
  accountMasked: text("account_masked"),
  purposeNote: text("purpose_note").notNull().default(""),
  sourceName: text("source_name"),
  rawText: text("raw_text").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("receipts_user_created_idx").on(table.userId, table.createdAt)]);
