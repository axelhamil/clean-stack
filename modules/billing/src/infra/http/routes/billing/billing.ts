import { AppErrorException, type IUseCase } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import type { IGetEntitlementsQuery } from "../../../../application/queries/get-entitlements.query";
import type { IGetPlanCatalogQuery } from "../../../../application/queries/get-plan-catalog.query";
import type {
  BillingPortalError,
  OpenBillingPortalInput,
  OpenBillingPortalOutput,
} from "../../../../application/usecases/open-billing-portal/open-billing-portal.dto";
import { type PortalHeadersValidation, portalHeadersSchema } from "./billing.schema";

export interface BillingRoutesDeps {
  routeGuards: RouteGuards;
  IGetPlanCatalogQuery: IGetPlanCatalogQuery;
  IGetEntitlementsQuery: IGetEntitlementsQuery;
  OpenBillingPortalUseCase: IUseCase<
    OpenBillingPortalInput,
    OpenBillingPortalOutput,
    BillingPortalError
  >;
}

export function createBillingRoutes(deps: BillingRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .get("/plans", async (c) => {
      const catalog = await deps.IGetPlanCatalogQuery.execute();

      return c.json({ plans: catalog.getValue() });
    })
    .get("/subscription", g.requireAuth, g.requireOrg, async (c) => {
      const view = await deps.IGetEntitlementsQuery.execute({ organizationId: g.currentOrgId(c) });

      return c.json(view.getValue());
    })
    .post(
      "/portal",
      g.requireAuth,
      g.requireCurrentPolicies,
      g.denyImpersonated,
      g.requireOrg,
      g.requireOrgPermission({ billing: ["manage"] }),
      zV<
        typeof portalHeadersSchema,
        "header",
        RouteEnv,
        "/portal",
        unknown,
        unknown,
        PortalHeadersValidation
      >("header", portalHeadersSchema),
      async (c) => {
        const { origin } = c.req.valid("header");
        const result = await deps.OpenBillingPortalUseCase.execute({
          organizationId: g.currentOrgId(c),
          returnUrl: `${origin ?? ""}/settings/billing`,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json(result.getValue());
      },
    );
}
