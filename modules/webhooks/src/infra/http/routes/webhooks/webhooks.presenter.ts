import type {
  WebhookDeliveryAttemptRecord,
  WebhookDeliveryRecord,
  WebhookDeliveryWithAttempts,
} from "../../../../application/ports/repositories/webhook-delivery.port";
import type { WebhookEndpointRecord } from "../../../../application/ports/repositories/webhook-endpoint.port";

export function toEndpointJson({
  secretCipher: _secretCipher,
  previousSecretCipher: _previousSecretCipher,
  previousSecretExpiresAt,
  firstFailedAt,
  disabledAt,
  ...rest
}: WebhookEndpointRecord) {
  return {
    ...rest,
    previousSecretExpiresAt: previousSecretExpiresAt.toNull(),
    firstFailedAt: firstFailedAt.toNull(),
    disabledAt: disabledAt.toNull(),
  };
}

export function toDeliveryJson({
  payload: _payload,
  nextAttemptAt,
  lastError,
  lastResponseStatus,
  ...rest
}: WebhookDeliveryRecord) {
  return {
    ...rest,
    nextAttemptAt: nextAttemptAt.toNull(),
    lastError: lastError.toNull(),
    lastResponseStatus: lastResponseStatus.toNull(),
  };
}

function toAttemptJson({
  requestHeaders,
  requestBody,
  responseStatus,
  responseHeaders,
  responseBody,
  durationMs,
  error,
  ...rest
}: WebhookDeliveryAttemptRecord) {
  return {
    ...rest,
    requestHeaders: requestHeaders.toNull(),
    requestBody: requestBody.toNull(),
    responseStatus: responseStatus.toNull(),
    responseHeaders: responseHeaders.toNull(),
    responseBody: responseBody.toNull(),
    durationMs: durationMs.toNull(),
    error: error.toNull(),
  };
}

export function toDeliveryDetailJson({
  nextAttemptAt,
  lastError,
  lastResponseStatus,
  attemptHistory,
  ...rest
}: WebhookDeliveryWithAttempts) {
  return {
    ...rest,
    nextAttemptAt: nextAttemptAt.toNull(),
    lastError: lastError.toNull(),
    lastResponseStatus: lastResponseStatus.toNull(),
    attemptHistory: attemptHistory.map(toAttemptJson),
  };
}
