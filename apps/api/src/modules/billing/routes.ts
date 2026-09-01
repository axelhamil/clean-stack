import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { di } from "../../container";
import type { AuthVariables } from "../../shared/middleware/auth.middleware";
import { requireAuth } from "../../shared/middleware/auth.middleware";
import { denyImpersonated } from "../../shared/middleware/deny-impersonated.middleware";
import { requireOrg, requireOrgPermission } from "../../shared/middleware/org.middleware";
import { requireCurrentPolicies } from "../../shared/middleware/policy.middleware";
import { stripeClient } from "./infrastructure/stripe-client";

export const billingRoutes = new Hono<{ Variables: AuthVariables }>()
  .get("/plans", async (c) => {
    const catalog = await di.BillingCatalogService.getCatalog();
    return c.json({ plans: catalog });
  })
  .get("/subscription", requireAuth, requireOrg, async (c) => {
    const orgId = c.get("orgId");
    const view = await di.EntitlementsService.getEntitlements(orgId);
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
      const orgId = c.get("orgId");
      const customerResult = await di.ISubscriptionReadStore.findCustomerIdByReference(orgId);
      if (customerResult.isFailure) {
        throw new AppErrorException({
          code: "BILLING_PROVIDER_FAILURE",
          message: "Failed to retrieve subscription data.",
        });
      }
      const customerOpt = customerResult.getValue();
      if (customerOpt.isNone()) {
        throw new AppErrorException({
          code: "BILLING_NOT_FOUND",
          message: "No paid subscription to manage.",
        });
      }
      const session = await di.IInstrumentation.startSpan(
        { name: "billingPortal.sessions.create", op: "http.client" },
        () =>
          stripeClient.billingPortal.sessions.create({
            customer: customerOpt.unwrap(),
            return_url: `${c.req.header("origin") ?? ""}/settings/billing`,
          }),
      );
      return c.json({ url: session.url });
    },
  );
