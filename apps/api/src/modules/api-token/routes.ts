import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { requireOrg, requireOrgPermission } from "../../shared/middleware/org.middleware";
import { zV } from "../../shared/validator";
import { createTokenBodySchema } from "./application/dto/create-token.dto";
import type { TokenOwner } from "./application/ports/api-token.port";

type Vars = AuthVariables;

export const apiTokenRoutes = new Hono<{ Variables: Vars }>()
  .get("/", requireAuth, async (c) => {
    const user = c.get("user");
    const session = c.get("session");
    const owner: TokenOwner = {
      userId: user.id,
      organizationId: session.activeOrganizationId ?? null,
    };
    const result = await di.ApiTokenService.list(owner);
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({
      items: result.getValue().map(({ tokenHmac: _hmac, pepperVersion: _pv, ...rest }) => rest),
    });
  })
  .post("/", requireAuth, zV("json", createTokenBodySchema), async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");
    const session = c.get("session");

    if (body.organizationId !== null) {
      if (session.activeOrganizationId !== body.organizationId) {
        throw new HTTPException(403, { message: "Organization mismatch" });
      }
      const noop = async () => {};
      // biome-ignore lint/suspicious/noExplicitAny: body scope drives org auth, not path — conditional middleware composition
      await requireOrg(c as any, noop);
      // biome-ignore lint/suspicious/noExplicitAny: body scope drives org auth, not path — conditional middleware composition
      await requireOrgPermission({ apiToken: ["create"] })(c as any, noop);
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
    const { tokenHmac: _hmac, pepperVersion: _pv, ...safeRecord } = record;
    return c.json({ token: raw, record: safeRecord }, 201);
  })
  .delete("/:id", requireAuth, async (c) => {
    const user = c.get("user");
    const session = c.get("session");
    const id = c.req.param("id");
    const owner: TokenOwner = {
      userId: user.id,
      organizationId: session.activeOrganizationId ?? null,
    };
    const result = await di.ApiTokenService.revoke(id, owner, user.id);
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({ deleted: true });
  });
