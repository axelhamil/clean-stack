import { EventTypes, type WebhookDeliveryExhaustedPayload } from "@packages/events";
import type { z } from "zod";
import type { WebhookDeliveryRecord } from "../ports/repositories/webhook-delivery.port";

export function webhookDeliveryExhaustedEvent(
  delivery: WebhookDeliveryRecord,
  organizationId: string,
) {
  const payload: z.infer<typeof WebhookDeliveryExhaustedPayload> = {
    organizationId,
    endpointId: delivery.endpointId,
    deliveryId: delivery.id,
    eventType: delivery.eventType,
    attempts: delivery.attempts,
    actorUserId: null,
  };

  return {
    type: EventTypes.WEBHOOK_DELIVERY_EXHAUSTED,
    aggregateType: "webhook_delivery",
    aggregateId: delivery.id,
    payload,
  };
}
