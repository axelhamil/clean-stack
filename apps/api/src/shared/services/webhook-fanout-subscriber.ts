import { uuidv7 } from "@packages/ddd-kit";
import { and, arrayContains, eq, type Transaction, webhooksSchema } from "@packages/drizzle";
import type { OutboxRecord } from "../ports/outbox.port";
import type { OutboxSubscriber } from "./outbox-subscriber";

export class WebhookFanoutSubscriber implements OutboxSubscriber {
  readonly name = "webhook-fanout";

  async handle(event: OutboxRecord, tx: Transaction): Promise<void> {
    if (!event.organizationId) return;
    const ep = webhooksSchema.webhookEndpoint;
    const endpoints = await tx
      .select({ id: ep.id })
      .from(ep)
      .where(
        and(
          eq(ep.organizationId, event.organizationId),
          eq(ep.enabled, true),
          arrayContains(ep.eventTypes, [event.eventType]),
        ),
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

    await tx.insert(webhooksSchema.webhookDelivery).values(rows).onConflictDoNothing({
      target: webhooksSchema.webhookDelivery.idempotencyKey,
    });
  }
}
