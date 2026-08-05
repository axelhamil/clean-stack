import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { adminLayout } from "../../router/layouts";

export const adminOrgsRoute = createRoute({
  getParentRoute: () => adminLayout,
  path: "admin/orgs",
  component: lazyRouteComponent(() => import("./admin-orgs.page"), "AdminOrgsPage"),
});
