import { Option, Result } from "@packages/ddd-kit";
import type * as apiTokenSchema from "../../../../schemas/api-token";
import type { ApiTokenRecord } from "../../../application/ports/repositories/api-token.port";
import { ApiToken, type ApiTokenProps } from "../../../domain/api-token/api-token.aggregate";
import { ApiTokenId } from "../../../domain/api-token/api-token-id";
import { TokenScopes } from "../../../domain/api-token/value-objects/token-scopes.vo";

type ApiTokenRow = typeof apiTokenSchema.apiToken.$inferSelect;
type ApiTokenInsert = typeof apiTokenSchema.apiToken.$inferInsert;

function propsOf(row: ApiTokenRow): Result<ApiTokenProps, string> {
  const scopes = TokenScopes.parse(row.scopes);
  if (scopes.isFailure) return Result.fail(`api_token ${row.id} holds invalid scopes`);

  return Result.ok({
    userId: row.userId,
    organizationId: Option.fromNullable(row.organizationId),
    name: row.name,
    scopes: scopes.getValue(),
    tokenHmac: row.tokenHmac,
    pepperVersion: row.pepperVersion,
    tokenStart: row.tokenStart,
    lastUsedAt: Option.fromNullable(row.lastUsedAt),
    expiresAt: Option.fromNullable(row.expiresAt),
    revokedAt: Option.fromNullable(row.revokedAt),
    revokedReason: Option.fromNullable(row.revokedReason),
    createdAt: row.createdAt,
  });
}

export function toApiToken(row: ApiTokenRow): Result<ApiToken, string> {
  return propsOf(row).map((props) => ApiToken.reconstitute(props, new ApiTokenId(row.id)));
}

export function toApiTokenRecord(row: ApiTokenRow): Result<ApiTokenRecord, string> {
  return propsOf(row).map((props) => ({ ...props, id: row.id, scopes: props.scopes.value }));
}

export function toApiTokenRow(token: ApiToken): ApiTokenInsert {
  return {
    id: token.id.value,
    userId: token.get("userId"),
    organizationId: token.get("organizationId").toNull(),
    name: token.get("name"),
    scopes: token.get("scopes").value,
    tokenHmac: token.get("tokenHmac"),
    pepperVersion: token.get("pepperVersion"),
    tokenStart: token.get("tokenStart"),
    lastUsedAt: token.get("lastUsedAt").toNull(),
    expiresAt: token.get("expiresAt").toNull(),
    revokedAt: token.get("revokedAt").toNull(),
    revokedReason: token.get("revokedReason").toNull(),
    createdAt: token.get("createdAt"),
  };
}
