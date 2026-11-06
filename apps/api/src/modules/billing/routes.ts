import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { Hono } from "hono";
import type { BillingCatalogService } from "./application/services/billing-catalog.service";
import type { BillingPortalService } from "./application/services/billing-portal.service";
import type { EntitlementsService } from "./application/services/entitlements.service";

export interface BillingRoutesDeps {
  routeGuards: RouteGuards;
  BillingCatalogService: Pick<BillingCatalogService, "getCatalog">;
  EntitlementsService: Pick<EntitlementsService, "getEntitlements">;
  BillingPortalService: Pick<BillingPortalService, "openPortal">;
}

export function createBillingRoutes(deps: BillingRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .get("/plans", async (c) => {
      const catalog = await deps.BillingCatalogService.getCatalog();

      return c.json({ plans: catalog });
    })
    .get("/subscription", g.requireAuth, g.requireOrg, async (c) => {
      const view = await deps.EntitlementsService.getEntitlements(g.currentOrgId(c));

      return c.json(view);
    })
    .post(
      "/portal",
      g.requireAuth,
      g.requireCurrentPolicies,
      g.denyImpersonated,
      g.requireOrg,
      g.requireOrgPermission({ billing: ["manage"] }),
      async (c) => {
        const returnUrl = `${c.req.header("origin") ?? ""}/settings/billing`;
        const result = await deps.BillingPortalService.openPortal(g.currentOrgId(c), returnUrl);
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json({ url: result.getValue() });
      },
    );
}
