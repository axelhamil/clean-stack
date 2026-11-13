import { EventTypes, type WebhookDeliveryReplayedPayload } from "@packages/events";
import type { z } from "zod";

export interface WebhookDeliveryReplayed {
  organizationId: string;
  endpointId: string;
  deliveryId: string;
  replayedDeliveryId: string;
  actorUserId: string;
}

export function webhookDeliveryReplayedEvent(fact: WebhookDeliveryReplayed) {
  const payload: z.infer<typeof WebhookDeliveryReplayedPayload> = {
    organizationId: fact.organizationId,
    endpointId: fact.endpointId,
    deliveryId: fact.deliveryId,
    replayedDeliveryId: fact.replayedDeliveryId,
    actorUserId: fact.actorUserId,
  };

  return {
    type: EventTypes.WEBHOOK_DELIVERY_REPLAYED,
    aggregateType: "webhook_delivery",
    aggregateId: fact.deliveryId,
    payload,
  };
}
