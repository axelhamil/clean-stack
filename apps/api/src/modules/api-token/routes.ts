import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { every } from "hono/combine";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { denyImpersonated } from "../../shared/middleware/deny-impersonated.middleware";
import { requireOrg, requireOrgPermission } from "../../shared/middleware/org.middleware";
import { requireCurrentPolicies } from "../../shared/middleware/policy.middleware";
import { type ApiTokenRecord, tokenOwnerForSession } from "../../shared/ports/api-token.port";
import { zV } from "../../shared/validator";
import { createTokenBodySchema } from "./application/dto/create-token.dto";

type Vars = AuthVariables;

const requireTokenCreationInOrg = every(requireOrg, requireOrgPermission({ apiToken: ["create"] }));

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

export const apiTokenRoutes = new Hono<{ Variables: Vars }>()
  .get("/", requireAuth, async (c) => {
    const user = c.get("user");
    const session = c.get("session");
    const owner = tokenOwnerForSession(user.id, session.activeOrganizationId ?? null);
    const result = await di.ApiTokenService.list(owner);
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({ items: result.getValue().map(toTokenJson) });
  })
  .post(
    "/",
    requireAuth,
    requireCurrentPolicies,
    denyImpersonated,
    zV("json", createTokenBodySchema),
    async (c) => {
      const body = c.req.valid("json");
      const user = c.get("user");
      const session = c.get("session");

      if (body.organizationId !== null) {
        if (session.activeOrganizationId !== body.organizationId) {
          throw new AppErrorException({
            code: "API_TOKEN_ORGANIZATION_NOT_FOUND",
            message: "Switch to this organization before creating a token for it.",
          });
        }
        await requireTokenCreationInOrg(c, async () => {});
      }

      const result = await di.ApiTokenService.create({
        userId: user.id,
        actorUserId: user.id,
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
  .delete("/:id", requireAuth, requireCurrentPolicies, denyImpersonated, async (c) => {
    const user = c.get("user");
    const session = c.get("session");
    const id = c.req.param("id");
    const owner = tokenOwnerForSession(user.id, session.activeOrganizationId ?? null);
    const result = await di.ApiTokenService.revoke(id, owner, user.id);
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({ deleted: true });
  });
