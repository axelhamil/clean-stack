import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { shellLayout } from "../../router/layouts";

export const dashboardRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "dashboard",
  component: lazyRouteComponent(() => import("./dashboard.page"), "DashboardPage"),
});
