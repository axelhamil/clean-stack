import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { adminLayout } from "../../router/layouts";

export const adminOrgDetailRoute = createRoute({
  getParentRoute: () => adminLayout,
  path: "admin/orgs/$orgId",
  component: lazyRouteComponent(() => import("./admin-org-detail.page"), "AdminOrgDetailPage"),
});
