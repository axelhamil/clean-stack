import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./multi-tenant";
import { outboxEvent } from "./outbox";

export const WEBHOOK_DELIVERY_STATUSES = ["pending", "success", "failed", "dead_letter"] as const;

export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

export const webhookEndpoint = pgTable(
  "webhook_endpoint",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secretCipher: text("secret_cipher").notNull(),
    eventTypes: text("event_types").array().notNull().default(sql`'{}'::text[]`),
    enabled: boolean("enabled").notNull().default(true),
    previousSecretCipher: text("previous_secret_cipher"),
    previousSecretExpiresAt: timestamp("previous_secret_expires_at"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    firstFailedAt: timestamp("first_failed_at"),
    disabledAt: timestamp("disabled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("webhook_endpoint_org_idx").on(table.organizationId)],
);

export const webhookDelivery = pgTable(
  "webhook_delivery",
  {
    id: text("id").primaryKey(),
    endpointId: text("endpoint_id")
      .notNull()
      .references(() => webhookEndpoint.id, { onDelete: "cascade" }),
    outboxEventId: text("outbox_event_id")
      .notNull()
      .references(() => outboxEvent.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    status: text("status", { enum: WEBHOOK_DELIVERY_STATUSES }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at"),
    lastError: text("last_error"),
    lastResponseStatus: integer("last_response_status"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("webhook_delivery_idempotency_uidx").on(table.idempotencyKey),
    index("webhook_delivery_pending_idx")
      .on(table.nextAttemptAt)
      .where(sql`${table.status} IN ('pending', 'failed')`),
    index("webhook_delivery_sweep_idx")
      .on(table.createdAt)
      .where(sql`${table.status} IN ('success', 'dead_letter')`),
    index("webhook_delivery_endpoint_idx").on(table.endpointId),
    index("webhook_delivery_event_idx").on(table.outboxEventId),
  ],
);

export const webhookDeliveryAttempt = pgTable(
  "webhook_delivery_attempt",
  {
    id: text("id").primaryKey(),
    deliveryId: text("delivery_id")
      .notNull()
      .references(() => webhookDelivery.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    requestHeaders: jsonb("request_headers").$type<Record<string, string>>(),
    requestBody: text("request_body"),
    responseStatus: integer("response_status"),
    responseHeaders: jsonb("response_headers").$type<Record<string, string>>(),
    responseBody: text("response_body"),
    durationMs: integer("duration_ms"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("webhook_delivery_attempt_delivery_idx").on(table.deliveryId, table.attemptNumber),
  ],
);

export const webhookEndpointRelations = relations(webhookEndpoint, ({ many, one }) => ({
  organization: one(organization, {
    fields: [webhookEndpoint.organizationId],
    references: [organization.id],
  }),
  deliveries: many(webhookDelivery),
}));

export const webhookDeliveryRelations = relations(webhookDelivery, ({ one, many }) => ({
  endpoint: one(webhookEndpoint, {
    fields: [webhookDelivery.endpointId],
    references: [webhookEndpoint.id],
  }),
  outboxEvent: one(outboxEvent, {
    fields: [webhookDelivery.outboxEventId],
    references: [outboxEvent.id],
  }),
  attempts: many(webhookDeliveryAttempt),
}));

export const webhookDeliveryAttemptRelations = relations(webhookDeliveryAttempt, ({ one }) => ({
  delivery: one(webhookDelivery, {
    fields: [webhookDeliveryAttempt.deliveryId],
    references: [webhookDelivery.id],
  }),
}));
