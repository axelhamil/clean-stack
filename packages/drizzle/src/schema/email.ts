import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const EMAIL_MESSAGE_STATUSES = ["pending", "sent", "failed"] as const;
export const EMAIL_MESSAGE_KINDS = ["template", "raw"] as const;

export const emailMessage = pgTable(
  "email_message",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: EMAIL_MESSAGE_KINDS }).notNull(),
    template: text("template"),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    locale: text("locale"),
    payload: jsonb("payload").$type<unknown>().notNull(),
    status: text("status", { enum: EMAIL_MESSAGE_STATUSES }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at"),
    sentAt: timestamp("sent_at"),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("email_message_idempotency_uidx").on(table.idempotencyKey),
    index("email_message_pending_idx")
      .on(table.nextAttemptAt, table.createdAt)
      .where(sql`${table.status} = 'pending'`),
    index("email_message_sweep_idx").on(table.sentAt).where(sql`${table.status} = 'sent'`),
    index("email_message_failed_sweep_idx")
      .on(table.createdAt)
      .where(sql`${table.status} = 'failed'`),
  ],
);
