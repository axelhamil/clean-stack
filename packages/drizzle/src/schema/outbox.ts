import { isNotNull, sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export type OutboxEventMetadata = {
  specversion: "1.0";
  source: string;
  subject?: string;
  traceparent?: string;
  requestId?: string;
  datacontenttype: "application/json";
};

export type OutboxDeliveries = Readonly<Record<string, string>>;

export const outboxEvent = pgTable(
  "outbox_event",
  {
    id: text("id").primaryKey(),
    eventType: text("event_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    organizationId: text("organization_id"),
    payload: jsonb("payload").$type<unknown>().notNull(),
    metadata: jsonb("metadata").$type<OutboxEventMetadata>().notNull(),
    occurredAt: timestamp("occurred_at").notNull(),
    dispatchedAt: timestamp("dispatched_at"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at"),
    deadAt: timestamp("dead_at"),
    deliveries: jsonb("deliveries").$type<OutboxDeliveries>().notNull().default({}),
  },
  (table) => [
    check("outbox_event_deliveries_object", sql`jsonb_typeof(${table.deliveries}) = 'object'`),
    index("outbox_event_pending_idx")
      .on(table.occurredAt, table.id)
      .where(sql`${table.dispatchedAt} is null and ${table.deadAt} is null`),
    index("outbox_event_dead_retry_idx")
      .on(table.nextAttemptAt)
      .where(sql`${table.dispatchedAt} is null and ${table.deadAt} is not null`),
    index("outbox_event_dispatched_idx")
      .on(table.dispatchedAt)
      .where(isNotNull(table.dispatchedAt)),
    index("outbox_event_type_idx").on(table.eventType),
    index("outbox_event_aggregate_idx").on(table.aggregateType, table.aggregateId),
  ],
);
