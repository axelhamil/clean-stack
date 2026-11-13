import type { ApiToken } from "../../../../domain/api-token/api-token.aggregate";

export function toTokenJson(token: ApiToken) {
  const scopes: string[] = [...token.get("scopes").value];

  return {
    id: token.id.value,
    userId: token.get("userId"),
    organizationId: token.get("organizationId").toNull(),
    name: token.get("name"),
    scopes,
    tokenStart: token.get("tokenStart"),
    lastUsedAt: token.get("lastUsedAt").toNull(),
    expiresAt: token.get("expiresAt").toNull(),
    revokedAt: token.get("revokedAt").toNull(),
    revokedReason: token.get("revokedReason").toNull(),
    createdAt: token.get("createdAt"),
  };
}
