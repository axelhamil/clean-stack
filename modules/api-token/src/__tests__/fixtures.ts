import { EventCollector, Option, Result } from "@packages/ddd-kit";
import type {
  ApiTokenError,
  ApiTokenRecord,
} from "../application/ports/repositories/api-token.port";
import { ApiToken } from "../domain/api-token/api-token.aggregate";
import { ApiTokenId } from "../domain/api-token/api-token-id";
import { TokenScopes } from "../domain/api-token/value-objects/token-scopes.vo";

export const PREFIX = "clean_";
export const GOLDEN_BODY = "3mJr7AoUXx2Wqd1zcyN6vbhBCe5LGSkP4QaRtfZEHnu9";
export const GOLDEN_RAW = "clean_3mJr7AoUXx2Wqd1zcyN6vbhBCe5LGSkP4QaRtfZEHnu91yLVR1";

export function tokenRecord(over: Partial<ApiTokenRecord> = {}): ApiTokenRecord {
  return {
    id: "tok-1",
    userId: "user-1",
    organizationId: Option.none(),
    name: "ci",
    scopes: ["read:profile"],
    tokenHmac: "hmac",
    pepperVersion: 1,
    tokenStart: "clean_3mJr7AoU",
    lastUsedAt: Option.none(),
    expiresAt: Option.none(),
    revokedAt: Option.none(),
    revokedReason: Option.none(),
    createdAt: new Date("2024-01-01"),
    ...over,
  };
}

export function apiToken(over: Partial<ApiTokenRecord> = {}): ApiToken {
  const { id, scopes, ...props } = tokenRecord(over);

  return ApiToken.reconstitute({ ...props, scopes: new TokenScopes(scopes) }, new ApiTokenId(id));
}

export function persisted<T>(outcome: T) {
  return async (token: ApiToken): Promise<Result<T, ApiTokenError>> => {
    EventCollector.collectFrom(token);
    return Result.ok(outcome);
  };
}
