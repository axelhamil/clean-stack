import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { every } from "hono/combine";
import { type ApiTokenRecord, tokenOwnerForSession } from "../../shared/ports/api-token.port";
import { createTokenBodySchema } from "./application/dto/create-token.dto";
import type { ApiTokenService } from "./application/services/api-token.service";

export interface ApiTokenRoutesDeps {
  routeGuards: RouteGuards;
  ApiTokenService: Pick<ApiTokenService, "list" | "create" | "revoke">;
}

/** The JSON shape of a token: no secret material, absent values as `null`. */
function toTokenJson(record: ApiTokenRecord) {
  return {
    id: record.id,
    userId: record.userId,
    organizationId: record.organizationId.toNull(),
    name: record.name,
    scopes: record.scopes,
    tokenStart: record.tokenStart,
    lastUsedAt: record.lastUsedAt.toNull(),
    expiresAt: record.expiresAt.toNull(),
    revokedAt: record.revokedAt.toNull(),
    revokedReason: record.revokedReason.toNull(),
    createdAt: record.createdAt,
  };
}

export function createApiTokenRoutes(deps: ApiTokenRoutesDeps) {
  const { routeGuards: g } = deps;
  const requireTokenCreationInOrg = every(
    g.requireOrg,
    g.requireOrgPermission({ apiToken: ["create"] }),
  );

  return new Hono<RouteEnv>()
    .get("/", g.requireAuth, async (c) => {
      const userId = g.currentUserId(c);
      const owner = tokenOwnerForSession(userId, g.activeOrgId(c).toNull());
      const result = await deps.ApiTokenService.list(owner);
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json({ items: result.getValue().map(toTokenJson) });
    })
    .post(
      "/",
      g.requireAuth,
      g.requireCurrentPolicies,
      g.denyImpersonated,
      zV("json", createTokenBodySchema),
      async (c) => {
        const body = c.req.valid("json");
        const userId = g.currentUserId(c);

        if (body.organizationId !== null) {
          if (g.activeOrgId(c).toNull() !== body.organizationId) {
            throw new AppErrorException({
              code: "API_TOKEN_ORGANIZATION_NOT_FOUND",
              message: "Switch to this organization before creating a token for it.",
            });
          }
          await requireTokenCreationInOrg(c, async () => {});
        }

        const result = await deps.ApiTokenService.create({
          userId,
          actorUserId: userId,
          name: body.name,
          scopes: body.scopes,
          organizationId: body.organizationId,
          expiresInDays: body.expiresInDays,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());
        const { record, raw } = result.getValue();
        return c.json({ token: raw, record: toTokenJson(record) }, 201);
      },
    )
    .delete("/:id", g.requireAuth, g.requireCurrentPolicies, g.denyImpersonated, async (c) => {
      const userId = g.currentUserId(c);
      const id = c.req.param("id");
      const owner = tokenOwnerForSession(userId, g.activeOrgId(c).toNull());
      const result = await deps.ApiTokenService.revoke(id, owner, userId);
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json({ deleted: true });
    });
}
