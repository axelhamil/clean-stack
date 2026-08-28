import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_shell/_admin/admin/users/$id")({
  component: lazyRouteComponent(() => import("./admin-user-detail.page"), "AdminUserDetailPage"),
});
