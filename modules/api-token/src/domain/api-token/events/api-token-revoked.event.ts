import { type IDomainEvent, uuidv7 } from "@packages/ddd-kit";
import { type ApiTokenRevokedPayload, EventTypes } from "@packages/events";
import type { z } from "zod";

export type ApiTokenRevoked = z.infer<typeof ApiTokenRevokedPayload>;

export function apiTokenRevokedEvent(
  payload: ApiTokenRevoked,
  dateOccurred: Date,
): IDomainEvent<ApiTokenRevoked> {
  return {
    eventId: uuidv7(),
    eventType: EventTypes.API_TOKEN_REVOKED,
    dateOccurred,
    aggregateId: payload.tokenId,
    aggregateType: "api_token",
    organizationId: payload.organizationId,
    payload,
  };
}
