import { Option } from "@packages/ddd-kit";
import type { WebhookDeliveryRecord } from "../../../application/ports/repositories/webhook-delivery.port";
import type { WebhookEndpointRecord } from "../../../application/ports/repositories/webhook-endpoint.port";

export function webhookDelivery(over: Partial<WebhookDeliveryRecord> = {}): WebhookDeliveryRecord {
  return {
    id: "del-1",
    endpointId: "ep-1",
    outboxEventId: "evt-1",
    eventType: "USER_CREATED",
    payload: { userId: "u1" },
    status: "pending",
    attempts: 1,
    nextAttemptAt: Option.none(),
    lastError: Option.none(),
    lastResponseStatus: Option.none(),
    idempotencyKey: "idem-1",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    ...over,
  };
}

export function webhookEndpoint(over: Partial<WebhookEndpointRecord> = {}): WebhookEndpointRecord {
  return {
    id: "ep-1",
    organizationId: "org-1",
    url: "https://example.com/hook",
    secretCipher: "current-cipher",
    eventTypes: ["USER_CREATED"],
    enabled: true,
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
    previousSecretCipher: Option.none(),
    previousSecretExpiresAt: Option.none(),
    consecutiveFailures: 0,
    firstFailedAt: Option.none(),
    disabledAt: Option.none(),
    ...over,
  };
}
