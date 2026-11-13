import { EventTypes, type WebhookEndpointDeletedPayload } from "@packages/events";
import type { z } from "zod";

export interface WebhookEndpointActed {
  organizationId: string;
  actorUserId: string;
  endpointId: string;
}

export function webhookEndpointDeletedEvent(fact: WebhookEndpointActed) {
  const payload: z.infer<typeof WebhookEndpointDeletedPayload> = {
    organizationId: fact.organizationId,
    actorUserId: fact.actorUserId,
    endpointId: fact.endpointId,
  };

  return {
    type: EventTypes.WEBHOOK_ENDPOINT_DELETED,
    aggregateType: "webhook_endpoint",
    aggregateId: fact.endpointId,
    payload,
  };
}
