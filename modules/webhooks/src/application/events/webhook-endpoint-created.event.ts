import { EventTypes, type WebhookEndpointCreatedPayload } from "@packages/events";
import type { z } from "zod";
import type { WebhookEndpointRecord } from "../ports/repositories/webhook-endpoint.port";

export function webhookEndpointCreatedEvent(endpoint: WebhookEndpointRecord, actorUserId: string) {
  const payload: z.infer<typeof WebhookEndpointCreatedPayload> = {
    organizationId: endpoint.organizationId,
    actorUserId,
    endpointId: endpoint.id,
    url: endpoint.url,
    eventTypes: endpoint.eventTypes,
    enabled: endpoint.enabled,
  };

  return {
    type: EventTypes.WEBHOOK_ENDPOINT_CREATED,
    aggregateType: "webhook_endpoint",
    aggregateId: endpoint.id,
    payload,
  };
}
