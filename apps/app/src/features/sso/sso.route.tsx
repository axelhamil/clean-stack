import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { orgScopeLayout } from "../../router/layouts";
import { ensureOrgPermission } from "../../shared/auth/ensure-org-permission";

export const ssoRoute = createRoute({
  getParentRoute: () => orgScopeLayout,
  path: "sso",
  // Registering a provider or a SCIM connection requires org owner/admin — the same
  // role floor `organization: ["update"]` already encodes — so gate the whole page
  // there rather than letting members reach a page full of controls that 403.
  beforeLoad: ensureOrgPermission({ organization: ["update"] }),
  component: lazyRouteComponent(() => import("./sso.page"), "SsoPage"),
});
