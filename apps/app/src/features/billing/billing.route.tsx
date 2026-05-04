import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { orgScopeLayout } from "../../router/layouts";
import { ensureOrgPermission } from "../../shared/auth/ensure-org-permission";

export const billingRoute = createRoute({
  getParentRoute: () => orgScopeLayout,
  path: "billing",
  beforeLoad: ensureOrgPermission({ billing: ["manage"] }),
  component: lazyRouteComponent(() => import("./billing.page"), "BillingPage"),
});
