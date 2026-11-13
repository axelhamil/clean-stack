import { EventTypes, type WebhookEndpointDisabledPayload } from "@packages/events";
import type { z } from "zod";

export interface WebhookEndpointDisabled {
  organizationId: string;
  endpointId: string;
  consecutiveFailures: number;
}

export function webhookEndpointDisabledEvent(fact: WebhookEndpointDisabled) {
  const payload: z.infer<typeof WebhookEndpointDisabledPayload> = {
    organizationId: fact.organizationId,
    endpointId: fact.endpointId,
    actorUserId: null,
    reason: "delivery_failures",
    consecutiveFailures: fact.consecutiveFailures,
  };

  return {
    type: EventTypes.WEBHOOK_ENDPOINT_DISABLED,
    aggregateType: "webhook_endpoint",
    aggregateId: fact.endpointId,
    payload,
  };
}
