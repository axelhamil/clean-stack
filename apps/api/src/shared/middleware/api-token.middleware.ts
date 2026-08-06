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

    // Checksum validation happens before any repo call — a malformed token must
    // not cost a round-trip to the database (the checksum is the cost barrier).
    const parsed = parseToken(raw, deps.prefix);
    if (!parsed.isSuccess) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const currentHmac = hmacToken(raw, deps.pepper);
    const currentLookup = await deps.repo.findByHmac(currentHmac);
    if (!currentLookup.isSuccess) {
      throw new HTTPException(503, { message: "Service Unavailable" });
    }

    let record = currentLookup.getValue().isSome() ? currentLookup.getValue().unwrap() : null;

    // Track whether the token was found via the previous pepper so we can rehash
    // AFTER validity checks — never write to the DB for a revoked or expired token.
    let needsRehash = false;
    if (!record && deps.pepperPrevious) {
      const previousHmac = hmacToken(raw, deps.pepperPrevious);
      const previousLookup = await deps.repo.findByHmac(previousHmac);
      if (!previousLookup.isSuccess) {
        throw new HTTPException(503, { message: "Service Unavailable" });
      }
      if (previousLookup.getValue().isSome()) {
        record = previousLookup.getValue().unwrap();
        needsRehash = true;
      }
    }

    if (!record) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const now = new Date();
    if (record.revokedAt !== null) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }
    if (record.expiresAt !== null && record.expiresAt < now) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    // Rehash only after the token is confirmed valid — avoids writing to the DB
    // for revoked or expired tokens that happened to use the previous pepper.
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
    c.set("tokenScopes", record.scopes as ApiScope[]);
    c.set("orgId", record.organizationId);

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
          organizationId: record.organizationId,
          tokenId: record.id,
          scopes: record.scopes,
        },
        { organizationId: record.organizationId ?? undefined },
      );
    }

    await next();
  });
}
