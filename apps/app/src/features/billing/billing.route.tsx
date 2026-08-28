import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { ensureOrgPermission } from "../../shared/auth/ensure-org-permission";

export const Route = createFileRoute("/_protected/_shell/settings/_org-scope/billing")({
  beforeLoad: ensureOrgPermission({ billing: ["manage"] }),
  component: lazyRouteComponent(() => import("./billing.page"), "BillingPage"),
});
