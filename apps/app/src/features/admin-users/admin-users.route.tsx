import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_shell/_admin/admin/users")({
  component: lazyRouteComponent(() => import("./admin-users.page"), "AdminUsersPage"),
});
