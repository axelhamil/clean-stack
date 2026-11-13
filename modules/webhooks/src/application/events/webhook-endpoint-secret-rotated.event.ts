import { EventTypes, type WebhookEndpointSecretRotatedPayload } from "@packages/events";
import type { z } from "zod";
import type { WebhookEndpointActed } from "./webhook-endpoint-deleted.event";

export function webhookEndpointSecretRotatedEvent(fact: WebhookEndpointActed) {
  const payload: z.infer<typeof WebhookEndpointSecretRotatedPayload> = {
    organizationId: fact.organizationId,
    endpointId: fact.endpointId,
    actorUserId: fact.actorUserId,
  };

  return {
    type: EventTypes.WEBHOOK_ENDPOINT_SECRET_ROTATED,
    aggregateType: "webhook_endpoint",
    aggregateId: fact.endpointId,
    payload,
  };
}
