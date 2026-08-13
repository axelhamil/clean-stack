import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_FREQUENCIES,
  NOTIFICATION_PREFERENCE_SCOPES,
} from "@packages/events";
import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { organization } from "./multi-tenant";

export const notification = pgTable(
  "notification",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    category: text("category").notNull(),
    eventType: text("event_type").notNull(),
    groupKey: text("group_key"),
    dedupKey: text("dedup_key"),
    payload: jsonb("payload").$type<unknown>().notNull(),
    readAt: timestamp("read_at"),
    emailPendingAt: timestamp("email_pending_at"),
    emailSentAt: timestamp("email_sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("notification_unread_idx").on(table.userId).where(sql`${table.readAt} IS NULL`),
    index("notification_feed_idx").on(table.userId, table.createdAt),
    uniqueIndex("notification_dedup_uidx")
      .on(table.userId, table.dedupKey)
      .where(sql`${table.dedupKey} IS NOT NULL`),
    index("notification_email_pending_idx")
      .on(table.emailPendingAt)
      .where(sql`${table.emailSentAt} IS NULL AND ${table.emailPendingAt} IS NOT NULL`),
    index("notification_sweep_idx").on(table.createdAt).where(sql`${table.readAt} IS NOT NULL`),
  ],
);

export const notificationPreference = pgTable(
  "notification_preference",
  {
    id: text("id").primaryKey(),
    scope: text("scope", { enum: NOTIFICATION_PREFERENCE_SCOPES }).notNull(),
    scopeId: text("scope_id").notNull(),
    category: text("category").notNull(),
    channel: text("channel", { enum: NOTIFICATION_CHANNELS }).notNull(),
    enabled: boolean("enabled").notNull(),
    frequency: text("frequency", { enum: NOTIFICATION_FREQUENCIES }).notNull().default("immediate"),
    locked: boolean("locked").notNull().default(false),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("notification_preference_uidx").on(
      table.scope,
      table.scopeId,
      table.category,
      table.channel,
    ),
  ],
);
