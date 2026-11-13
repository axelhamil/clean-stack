import { type IDomainEvent, uuidv7 } from "@packages/ddd-kit";
import { type ApiTokenCreatedPayload, EventTypes } from "@packages/events";
import type { z } from "zod";

export type ApiTokenCreated = z.infer<typeof ApiTokenCreatedPayload>;

export function apiTokenCreatedEvent(
  payload: ApiTokenCreated,
  dateOccurred: Date,
): IDomainEvent<ApiTokenCreated> {
  return {
    eventId: uuidv7(),
    eventType: EventTypes.API_TOKEN_CREATED,
    dateOccurred,
    aggregateId: payload.tokenId,
    aggregateType: "api_token",
    organizationId: payload.organizationId,
    payload,
  };
}
