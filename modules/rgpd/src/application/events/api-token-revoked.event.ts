import type { Option } from "@packages/ddd-kit";
import { type ApiTokenRevokedPayload, EventTypes } from "@packages/events";
import type { z } from "zod";

export interface TokenRevokedByErasure {
  tokenId: string;
  organizationId: Option<string>;
  erasedUserId: string;
}

export function apiTokenRevokedEvent(fact: TokenRevokedByErasure) {
  const payload: z.infer<typeof ApiTokenRevokedPayload> = {
    userId: fact.erasedUserId,
    actorUserId: fact.erasedUserId,
    organizationId: fact.organizationId.toNull(),
    tokenId: fact.tokenId,
    reason: "user",
  };

  return {
    type: EventTypes.API_TOKEN_REVOKED,
    aggregateType: "api_token",
    aggregateId: fact.tokenId,
    payload,
  };
}
