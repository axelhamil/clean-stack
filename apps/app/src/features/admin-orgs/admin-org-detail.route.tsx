import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_shell/_admin/admin/orgs/$orgId")({
  component: lazyRouteComponent(() => import("./admin-org-detail.page"), "AdminOrgDetailPage"),
});
