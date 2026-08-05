import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { adminLayout } from "../../router/layouts";

export const adminUsersRoute = createRoute({
  getParentRoute: () => adminLayout,
  path: "admin/users",
  component: lazyRouteComponent(() => import("./admin-users.page"), "AdminUsersPage"),
});
