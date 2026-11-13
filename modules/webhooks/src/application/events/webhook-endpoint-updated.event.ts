import { EventTypes, type WebhookEndpointUpdatedPayload } from "@packages/events";
import type { z } from "zod";

export interface WebhookEndpointUpdated {
  organizationId: string;
  actorUserId: string;
  endpointId: string;
  url?: string;
  eventTypes?: string[];
  enabled?: boolean;
}

export function webhookEndpointUpdatedEvent(fact: WebhookEndpointUpdated) {
  const changes: Record<string, unknown> = {};
  if (fact.url !== undefined) changes.url = fact.url;
  if (fact.eventTypes !== undefined) changes.eventTypes = fact.eventTypes;
  if (fact.enabled !== undefined) changes.enabled = fact.enabled;

  const payload: z.infer<typeof WebhookEndpointUpdatedPayload> = {
    organizationId: fact.organizationId,
    actorUserId: fact.actorUserId,
    endpointId: fact.endpointId,
    changes,
  };

  return {
    type: EventTypes.WEBHOOK_ENDPOINT_UPDATED,
    aggregateType: "webhook_endpoint",
    aggregateId: fact.endpointId,
    payload,
  };
}
