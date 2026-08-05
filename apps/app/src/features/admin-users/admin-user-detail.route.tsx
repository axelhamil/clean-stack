import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { adminLayout } from "../../router/layouts";

export const adminUserDetailRoute = createRoute({
  getParentRoute: () => adminLayout,
  path: "admin/users/$id",
  component: lazyRouteComponent(() => import("./admin-user-detail.page"), "AdminUserDetailPage"),
});
