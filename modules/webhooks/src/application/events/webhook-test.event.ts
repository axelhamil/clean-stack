import { EventTypes, type WebhookTestPayload } from "@packages/events";
import type { z } from "zod";
import type { WebhookEndpointActed } from "./webhook-endpoint-deleted.event";

export function webhookTestEvent(fact: WebhookEndpointActed) {
  const payload: z.infer<typeof WebhookTestPayload> = {
    organizationId: fact.organizationId,
    endpointId: fact.endpointId,
    actorUserId: fact.actorUserId,
  };

  return {
    type: EventTypes.WEBHOOK_TEST,
    aggregateType: "webhook_endpoint",
    aggregateId: fact.endpointId,
    payload,
  };
}
