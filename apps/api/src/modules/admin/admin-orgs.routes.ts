import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { denyImpersonated } from "../../shared/middleware/deny-impersonated.middleware";
import { assertStepUp, requireStaffPermission } from "../../shared/middleware/staff.middleware";
import { AdminActionService } from "../../shared/services/admin-action.service";
import {
  setSsoEnforcementBodySchema,
  ssoEnforcementChangeNeedsStepUp,
} from "../../shared/services/set-sso-enforcement.dto";
import { zV } from "../../shared/validator";
import { listOrgsQuerySchema } from "./application/dto/list-orgs.dto";

const actionSvc = new AdminActionService(
  di.IOutboxRepository,
  di.ITransactionService,
  di.IInstrumentation,
);

export const adminOrgRoutes = new Hono<{ Variables: AuthVariables }>()
  .get(
    "/",
    requireAuth,
    requireStaffPermission("orgs.read"),
    zV("query", listOrgsQuerySchema),
    async (c) => {
      const result = await di.AdminQueryService.listOrgs(c.req.valid("query"));
      if (result.isFailure) throw new AppErrorException(result.getError());
      const page = result.getValue();
      return c.json({
        items: page.items.map((o) => ({
          ...o,
          createdAt: o.createdAt.toISOString(),
        })),
        nextCursor: page.nextCursor.toNull(),
      });
    },
  )
  .get("/:id", requireAuth, requireStaffPermission("orgs.read"), async (c) => {
    const result = await di.AdminQueryService.getOrg(c.req.param("id"));
    if (result.isFailure) throw new AppErrorException(result.getError());
    const found = result.getValue();
    if (found.isNone()) throw new HTTPException(404, { message: "ADMIN_ORG_NOT_FOUND" });
    const o = found.unwrap();
    return c.json({
      ...o,
      createdAt: o.createdAt.toISOString(),
      plan: o.plan.toNull(),
    });
  })
  .post(
    "/:id/sso-enforcement",
    requireAuth,
    requireStaffPermission("orgs.sso"),
    denyImpersonated,
    zV("json", setSsoEnforcementBodySchema),
    async (c) => {
      const body = c.req.valid("json");
      const { enforced } = body;
      if (ssoEnforcementChangeNeedsStepUp(body))
        await assertStepUp(c.get("user"), c.get("session"));

      const result = await actionSvc.setSsoEnforcement({
        organizationId: c.req.param("id"),
        enforced,
        actorUserId: c.get("user").id,
        viaPlatformAdmin: true,
      });
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json({ ok: true });
    },
  );
