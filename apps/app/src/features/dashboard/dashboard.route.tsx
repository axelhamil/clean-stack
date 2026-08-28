import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_shell/dashboard")({
  component: lazyRouteComponent(() => import("./dashboard.page"), "DashboardPage"),
});
