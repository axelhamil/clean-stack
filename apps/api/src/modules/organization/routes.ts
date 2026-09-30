import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { requireFeature } from "../../shared/middleware/billing.middleware";
import { denyImpersonated } from "../../shared/middleware/deny-impersonated.middleware";
import { requireOrg, requireOrgPermission } from "../../shared/middleware/org.middleware";
import { requireCurrentPolicies } from "../../shared/middleware/policy.middleware";
import { AdminActionService } from "../../shared/services/admin-action.service";
import { ScimConnectionService } from "../../shared/services/scim-connection.service";
import { setSsoEnforcementBodySchema } from "../../shared/services/set-sso-enforcement.dto";
import { zV } from "../../shared/validator";

const actionSvc = new AdminActionService(
  di.IOutboxRepository,
  di.ITransactionService,
  di.IInstrumentation,
);

const scimSvc = new ScimConnectionService(di.IOutboxRepository, di.IInstrumentation);

// The directory connection is the SCIM half of the enterprise SSO entitlement, and
// only the owner manages it: a token that provisions members is a credential over
// the organization's membership itself.
const scimConnectionGates = [
  requireAuth,
  requireCurrentPolicies,
  requireOrg,
  requireOrgPermission({ scim: ["manage"] }),
  requireFeature("sso"),
] as const;

export const organizationSettingsRoutes = new Hono<{ Variables: AuthVariables }>()
  .post(
    "/sso-enforcement",
    requireAuth,
    requireCurrentPolicies,
    requireOrg,
    requireOrgPermission({ organization: ["update"] }),
    denyImpersonated,
    zV("json", setSsoEnforcementBodySchema),
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
  )
  .get("/scim-connection", ...scimConnectionGates, async (c) => {
    const result = await scimSvc.find(c.get("orgId"));
    if (result.isFailure) throw new AppErrorException(result.getError());

    const connection = result.getValue().map((view) => ({
      createdAt: view.createdAt.toISOString(),
      tokenExpiresAt: view.tokenExpiresAt.map((date) => date.toISOString()).toNull(),
    }));
    return c.json({ connection: connection.toNull() });
  })
  .post("/scim-connection", ...scimConnectionGates, denyImpersonated, async (c) => {
    const result = await scimSvc.issueToken({
      organizationId: c.get("orgId"),
      actorUserId: c.get("user").id,
    });
    if (result.isFailure) throw new AppErrorException(result.getError());

    const { token, expiresAt } = result.getValue();
    return c.json({ token, expiresAt: expiresAt.toISOString() });
  })
  .delete("/scim-connection", ...scimConnectionGates, denyImpersonated, async (c) => {
    const result = await scimSvc.disconnect({
      organizationId: c.get("orgId"),
      actorUserId: c.get("user").id,
    });
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json({ ok: true });
  });
