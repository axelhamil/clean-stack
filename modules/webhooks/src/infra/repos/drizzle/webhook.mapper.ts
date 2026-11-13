import { Option } from "@packages/ddd-kit";
import type * as webhooksSchema from "../../../../schemas/webhooks";
import type {
  WebhookDeliveryAttemptRecord,
  WebhookDeliveryRecord,
} from "../../../application/ports/repositories/webhook-delivery.port";
import type { WebhookEndpointRecord } from "../../../application/ports/repositories/webhook-endpoint.port";

type EndpointRow = typeof webhooksSchema.webhookEndpoint.$inferSelect;
type DeliveryRow = typeof webhooksSchema.webhookDelivery.$inferSelect;
type AttemptRow = typeof webhooksSchema.webhookDeliveryAttempt.$inferSelect;

export function toEndpointRecord(row: EndpointRow): WebhookEndpointRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    url: row.url,
    secretCipher: row.secretCipher,
    eventTypes: row.eventTypes,
    enabled: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    previousSecretCipher: Option.fromNullable(row.previousSecretCipher),
    previousSecretExpiresAt: Option.fromNullable(row.previousSecretExpiresAt),
    consecutiveFailures: row.consecutiveFailures,
    firstFailedAt: Option.fromNullable(row.firstFailedAt),
    disabledAt: Option.fromNullable(row.disabledAt),
  };
}

export function toDeliveryRecord(row: DeliveryRow): WebhookDeliveryRecord {
  return {
    id: row.id,
    endpointId: row.endpointId,
    outboxEventId: row.outboxEventId,
    eventType: row.eventType,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: Option.fromNullable(row.nextAttemptAt),
    lastError: Option.fromNullable(row.lastError),
    lastResponseStatus: Option.fromNullable(row.lastResponseStatus),
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
  };
}

export function toAttemptRecord(row: AttemptRow): WebhookDeliveryAttemptRecord {
  return {
    id: row.id,
    deliveryId: row.deliveryId,
    attemptNumber: row.attemptNumber,
    requestHeaders: Option.fromNullable(row.requestHeaders),
    requestBody: Option.fromNullable(row.requestBody),
    responseStatus: Option.fromNullable(row.responseStatus),
    responseHeaders: Option.fromNullable(row.responseHeaders),
    responseBody: Option.fromNullable(row.responseBody),
    durationMs: Option.fromNullable(row.durationMs),
    error: Option.fromNullable(row.error),
    createdAt: row.createdAt,
  };
}
