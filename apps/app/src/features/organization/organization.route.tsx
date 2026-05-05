import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { orgScopeLayout } from "../../router/layouts";

export const organizationRoute = createRoute({
  getParentRoute: () => orgScopeLayout,
  path: "organization",
  component: lazyRouteComponent(() => import("./organization.page"), "OrganizationPage"),
});
