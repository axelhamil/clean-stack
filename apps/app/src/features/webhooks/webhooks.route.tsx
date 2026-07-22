import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { orgScopeLayout } from "../../router/layouts";
import { ensureOrgPermission } from "../../shared/auth/ensure-org-permission";

export const webhooksRoute = createRoute({
  getParentRoute: () => orgScopeLayout,
  path: "webhooks",
  beforeLoad: ensureOrgPermission({ webhooks: ["read"] }),
  component: lazyRouteComponent(() => import("./webhooks.page"), "WebhooksPage"),
});
