import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { di } from "../../container";
import type { AuthVariables } from "../../shared/middleware/auth.middleware";
import { requireAuth } from "../../shared/middleware/auth.middleware";
import { denyImpersonated } from "../../shared/middleware/deny-impersonated.middleware";
import { requireOrg, requireOrgPermission } from "../../shared/middleware/org.middleware";
import { requireCurrentPolicies } from "../../shared/middleware/policy.middleware";

export const billingRoutes = new Hono<{ Variables: AuthVariables }>()
  .get("/plans", async (c) => {
    const catalog = await di.BillingCatalogService.getCatalog();

    return c.json({ plans: catalog });
  })
  .get("/subscription", requireAuth, requireOrg, async (c) => {
    const view = await di.EntitlementsService.getEntitlements(c.get("orgId"));

    return c.json(view);
  })
  .post(
    "/portal",
    requireAuth,
    requireCurrentPolicies,
    denyImpersonated,
    requireOrg,
    requireOrgPermission({ billing: ["manage"] }),
    async (c) => {
      const returnUrl = `${c.req.header("origin") ?? ""}/settings/billing`;
      const result = await di.BillingPortalService.openPortal(c.get("orgId"), returnUrl);
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json({ url: result.getValue() });
    },
  );
