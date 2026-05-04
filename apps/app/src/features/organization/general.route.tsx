import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { orgScopeLayout } from "../../router/layouts";
import { ensureOrgPermission } from "../../shared/auth/ensure-org-permission";

export const generalRoute = createRoute({
  getParentRoute: () => orgScopeLayout,
  path: "general",
  beforeLoad: ensureOrgPermission({ organization: ["update"] }),
  component: lazyRouteComponent(() => import("./general.page"), "GeneralPage"),
});
