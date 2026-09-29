import { EventTypes } from "@packages/events";
import type { MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { SessionUser } from "../../auth";
import { findUserById } from "../../auth-queries";
import type { ApiScope } from "../../modules/api-token/application/dto/create-token.dto";
import type { IApiTokenRepository } from "../../modules/api-token/application/ports/api-token.port";
import { hmacToken, parseToken } from "../crypto/api-token";
import { emitEvent } from "../event-emitter";
import type { IOutboxRepository } from "../ports/outbox.port";

export interface ApiTokenVariables {
  user: SessionUser;
  tokenScopes: ApiScope[];
  orgId: string | null;
  apiTokenId: string;
}

export interface ApiTokenDeps {
  repo: IApiTokenRepository;
  outbox: IOutboxRepository;
  prefix: string;
  pepper: string;
  pepperVersion: number;
  pepperPrevious?: string;
  bucketMin: number;
  platformAdminIds: string[];
}

export function requireApiToken(
  deps: ApiTokenDeps,
  options: { scopes: ApiScope[] },
): MiddlewareHandler<{ Variables: ApiTokenVariables }> {
  return createMiddleware<{ Variables: ApiTokenVariables }>(async (c, next) => {
    const authHeader = c.req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const raw = authHeader.slice(7);

    // Checksum validation happens before any repo call: a malformed token must
    // not cost a round-trip to the database (the checksum is the cost barrier).
    const parsed = parseToken(raw, deps.prefix);
    if (!parsed.isSuccess) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const lookup = async (hmac: string) => {
      const found = await deps.repo.findByHmac(hmac);
      if (!found.isSuccess) throw new HTTPException(503, { message: "Service Unavailable" });
      return found.getValue();
    };

    const currentHmac = hmacToken(raw, deps.pepper);
    let match = await lookup(currentHmac);

    // Track whether the token was found via the previous pepper so we can rehash
    // AFTER validity checks: never write to the DB for a revoked or expired token.
    let needsRehash = false;
    if (match.isNone() && deps.pepperPrevious) {
      match = await lookup(hmacToken(raw, deps.pepperPrevious));
      needsRehash = match.isSome();
    }

    if (match.isNone()) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }
    const record = match.unwrap();

    const now = new Date();
    if (record.revokedAt.isSome()) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }
    if (record.expiresAt.isSome() && record.expiresAt.unwrap() < now) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    if (needsRehash) {
      await deps.repo.rehash(record.id, currentHmac, deps.pepperVersion);
    }

    const recordScopes = record.scopes as ApiScope[];
    // 403, not 401: the bearer is authenticated, it just lacks the required permission.
    if (!options.scopes.every((s) => recordScopes.includes(s))) {
      throw new HTTPException(403, { message: "Forbidden" });
    }

    const userRow = await findUserById(record.userId);
    if (!userRow) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const isBanned =
      userRow.banned === true && (userRow.banExpires === null || userRow.banExpires > now);
    if (isBanned) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const user = {
      ...userRow,
      isPlatformAdmin: deps.platformAdminIds.includes(userRow.id) || userRow.role === "admin",
    } as unknown as SessionUser;

    // apiTokenId must be set before the per-token rate-limit policy runs.
    c.set("apiTokenId", record.id);
    c.set("user", user);
    c.set("tokenScopes", recordScopes);
    c.set("orgId", record.organizationId.toNull());

    const bucketFloor = new Date(Date.now() - deps.bucketMin * 60_000);
    const touchResult = await deps.repo.touchLastUsed(record.id, bucketFloor);
    if (touchResult.isSuccess && touchResult.getValue()) {
      await emitEvent(
        deps.outbox,
        EventTypes.API_TOKEN_USED,
        "api_token",
        record.id,
        {
          userId: record.userId,
          actorUserId: record.userId,
          organizationId: record.organizationId.toNull(),
          tokenId: record.id,
          scopes: record.scopes,
        },
        { organizationId: record.organizationId.toUndefined() },
      );
    }

    await next();
  });
}
