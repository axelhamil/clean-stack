import { beforeEach, describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { openRouteGuards } from "@packages/http/testing/route-guards";
import { mockPort } from "@packages/test/bun";
import { Hono } from "hono";
import {
  type BillingRoutesDeps,
  createBillingRoutes,
} from "../../../infra/http/routes/billing/billing";

const openPortal = mockPort<BillingRoutesDeps["OpenBillingPortalUseCase"]>();

beforeEach(() => {
  openPortal.execute.mockClear();
  openPortal.execute.mockResolvedValue(Result.ok({ url: "https://billing.stripe.test/session" }));
});

function postPortal(headers: Record<string, string>) {
  const app = new Hono().route(
    "/billing",
    createBillingRoutes({
      routeGuards: openRouteGuards({ userId: "user-1", orgId: "org-1" }),
      IGetPlanCatalogQuery: mockPort<BillingRoutesDeps["IGetPlanCatalogQuery"]>(),
      IGetEntitlementsQuery: mockPort<BillingRoutesDeps["IGetEntitlementsQuery"]>(),
      OpenBillingPortalUseCase: openPortal,
    }),
  );

  return app.request("/billing/portal", { method: "POST", headers });
}

describe("POST /billing/portal", () => {
  it("given an origin, when the portal opens, then Stripe returns the user to its billing page", async () => {
    const response = await postPortal({ origin: "https://app.test" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://billing.stripe.test/session" });
    expect(openPortal.execute).toHaveBeenCalledWith({
      organizationId: "org-1",
      returnUrl: "https://app.test/settings/billing",
    });
  });

  it("given no origin, when the portal opens, then the return path stays relative", async () => {
    await postPortal({});

    expect(openPortal.execute).toHaveBeenCalledWith({
      organizationId: "org-1",
      returnUrl: "/settings/billing",
    });
  });
});
