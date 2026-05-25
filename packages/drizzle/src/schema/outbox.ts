import { isNull } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export type OutboxEventMetadata = {
  specversion: "1.0";
  source: string;
  subject?: string;
  traceparent?: string;
  datacontenttype: "application/json";
};

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
  },
  (table) => [
    index("outbox_event_pending_idx")
      .on(table.nextAttemptAt, table.occurredAt)
      .where(isNull(table.dispatchedAt)),
    index("outbox_event_type_idx").on(table.eventType),
    index("outbox_event_aggregate_idx").on(table.aggregateType, table.aggregateId),
  ],
);
