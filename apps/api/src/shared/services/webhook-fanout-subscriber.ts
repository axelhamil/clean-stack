import { uuidv7 } from "@packages/ddd-kit";
import { and, eq, type Transaction, webhooksSchema } from "@packages/drizzle";
import { type EventType, INTERNAL_EVENT_TYPES, matchesSubscription } from "@packages/events";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { OutboxRecord } from "../ports/outbox.port";
import type { OutboxSubscriber } from "./outbox-subscriber";

export class WebhookFanoutSubscriber implements OutboxSubscriber {
  readonly name = "webhook-fanout";

  constructor(private readonly instrumentation: IInstrumentation) {}

  async handle(event: OutboxRecord, tx: Transaction): Promise<void> {
    return this.instrumentation.startSpan(
      { name: "WebhookFanoutSubscriber > handle" },
      async () => {
        try {
          if (!event.organizationId) return;
          if (INTERNAL_EVENT_TYPES.includes(event.eventType as EventType)) return;
          const ep = webhooksSchema.webhookEndpoint;
          const endpointsQuery = tx
            .select({ id: ep.id, eventTypes: ep.eventTypes })
            .from(ep)
            .where(and(eq(ep.organizationId, event.organizationId), eq(ep.enabled, true)));
          const endpointRows = await this.instrumentation.startSpan(
            {
              name: endpointsQuery.toSQL().sql,
              op: "db.query",
              attributes: { "db.system.name": "postgresql" },
            },
            () => endpointsQuery.execute(),
          );
          const endpoints = endpointRows.filter((e) =>
            matchesSubscription(event.eventType as EventType, e.eventTypes),
          );

          if (endpoints.length === 0) return;

          const now = new Date();
          const rows = endpoints.map((e) => ({
            id: uuidv7(),
            endpointId: e.id,
            outboxEventId: event.id,
            eventType: event.eventType,
            payload: event.payload,
            status: "pending" as const,
            attempts: 0,
            nextAttemptAt: now,
            idempotencyKey: `${event.id}:${e.id}`,
          }));

          const insertQuery = tx
            .insert(webhooksSchema.webhookDelivery)
            .values(rows)
            .onConflictDoNothing({ target: webhooksSchema.webhookDelivery.idempotencyKey });
          await this.instrumentation.startSpan(
            {
              name: insertQuery.toSQL().sql,
              op: "db.query",
              attributes: { "db.system.name": "postgresql" },
            },
            () => insertQuery.execute(),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          throw err;
        }
      },
    );
  }
}
