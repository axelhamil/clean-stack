import { type IUnitOfWork, uuidv7 } from "@packages/ddd-kit";

import { and, dbNow, eq, resolveExecutor, webhooksSchema } from "@packages/drizzle";
import { isKnownEventType, isPublicEvent, matchesSubscription } from "@packages/events";
import type { BuiltInEventHandler } from "../event-handlers";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { DeliveredEvent } from "../ports/outbox.port";

const ep = webhooksSchema.webhookEndpoint;
const wd = webhooksSchema.webhookDelivery;
const dbAttrs = { "db.system.name": "postgresql" } as const;

export class WebhookFanoutSubscriber implements BuiltInEventHandler {
  readonly name = "webhook-fanout";

  constructor(
    private readonly uow: IUnitOfWork,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async handle(event: DeliveredEvent): Promise<void> {
    return this.instrumentation.startSpan(
      { name: "WebhookFanoutSubscriber > handle" },
      async () => {
        try {
          const { eventId, eventType, organizationId } = event;
          if (!organizationId) return;
          if (!isKnownEventType(eventType) || !isPublicEvent(eventType)) return;

          await this.uow.run(async () => {
            const exec = resolveExecutor();
            const endpointsQuery = exec
              .select({ id: ep.id, eventTypes: ep.eventTypes })
              .from(ep)
              .where(and(eq(ep.organizationId, organizationId), eq(ep.enabled, true)));
            const endpointRows = await this.instrumentation.startSpan(
              { name: endpointsQuery.toSQL().sql, op: "db.query", attributes: dbAttrs },
              () => endpointsQuery.execute(),
            );
            const endpoints = endpointRows.filter((e) =>
              matchesSubscription(eventType, e.eventTypes),
            );
            if (endpoints.length === 0) return;

            const insertQuery = exec
              .insert(wd)
              .values(
                endpoints.map((e) => ({
                  id: uuidv7(),
                  endpointId: e.id,
                  outboxEventId: eventId,
                  eventType,
                  payload: event.payload,
                  status: "pending" as const,
                  attempts: 0,
                  nextAttemptAt: dbNow,
                  idempotencyKey: `${eventId}:${e.id}`,
                })),
              )
              .onConflictDoNothing({ target: wd.idempotencyKey });
            await this.instrumentation.startSpan(
              { name: insertQuery.toSQL().sql, op: "db.query", attributes: dbAttrs },
              () => insertQuery.execute(),
            );
          });
        } catch (err) {
          this.instrumentation.capture(err);
          throw err;
        }
      },
    );
  }
}
