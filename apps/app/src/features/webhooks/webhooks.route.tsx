import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { ensureOrgPermission } from "../../shared/auth/ensure-org-permission";

export const Route = createFileRoute("/_protected/_shell/settings/_org-scope/webhooks")({
  beforeLoad: ensureOrgPermission({ webhooks: ["read"] }),
  component: lazyRouteComponent(() => import("./webhooks.page"), "WebhooksPage"),
});
