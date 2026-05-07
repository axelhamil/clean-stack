import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const AUDIT_ACTOR_TYPES = ["user", "system", "admin"] as const;
export const AUDIT_RETENTIONS = ["operational", "compliance"] as const;

export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];
export type AuditRetention = (typeof AUDIT_RETENTIONS)[number];

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id"),
    actorType: text("actor_type", { enum: AUDIT_ACTOR_TYPES }).notNull(),
    organizationId: text("organization_id"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadata: jsonb("metadata").$type<unknown>().notNull(),
    requestId: text("request_id"),
    retention: text("retention", { enum: AUDIT_RETENTIONS }).notNull(),
    prevHash: text("prev_hash"),
    hash: text("hash"),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_log_actor_time_idx").on(table.actorId, sql`${table.occurredAt} DESC`),
    index("audit_log_target_idx").on(table.targetType, table.targetId),
    index("audit_log_action_time_idx").on(table.action, sql`${table.occurredAt} DESC`),
    index("audit_log_org_time_idx").on(table.organizationId, sql`${table.occurredAt} DESC`),
    index("audit_log_retention_time_idx").on(table.retention, table.occurredAt),
  ],
);
