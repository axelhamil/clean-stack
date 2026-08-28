import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { z } from "zod";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { denyImpersonated } from "../../shared/middleware/deny-impersonated.middleware";
import { requireOrg, requireOrgPermission } from "../../shared/middleware/org.middleware";
import { AdminActionService } from "../../shared/services/admin-action.service";
import { zV } from "../../shared/validator";

const ssoEnforcementBodySchema = z.object({ enforced: z.boolean() });

const actionSvc = new AdminActionService(
  di.IOutboxRepository,
  di.ITransactionService,
  di.IInstrumentation,
);

export const organizationSettingsRoutes = new Hono<{ Variables: AuthVariables }>().post(
  "/sso-enforcement",
  requireAuth,
  requireOrg,
  requireOrgPermission({ organization: ["update"] }),
  denyImpersonated,
  zV("json", ssoEnforcementBodySchema),
  async (c) => {
    const orgId = c.get("orgId");
    const result = await actionSvc.setSsoEnforcement({
      organizationId: orgId,
      enforced: c.req.valid("json").enforced,
      actorUserId: c.get("user").id,
      viaPlatformAdmin: false,
    });
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({ ok: true });
  },
);
