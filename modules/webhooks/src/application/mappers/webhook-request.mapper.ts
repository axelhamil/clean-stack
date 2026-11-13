import type { WebhookDeliveryRecord } from "../ports/repositories/webhook-delivery.port";

export function toWebhookBody(delivery: WebhookDeliveryRecord): string {
  return JSON.stringify({
    id: delivery.outboxEventId,
    type: delivery.eventType,
    data: delivery.payload,
    time: delivery.createdAt.toISOString(),
  });
}

export function toWebhookHeaders(
  delivery: WebhookDeliveryRecord,
  signature: string,
): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-webhook-signature": signature,
    "x-webhook-event-id": delivery.outboxEventId,
    "x-webhook-event-type": delivery.eventType,
    "x-webhook-idempotency": delivery.idempotencyKey,
  };
}
