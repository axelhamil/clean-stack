import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_shell/_admin/admin/orgs")({
  component: lazyRouteComponent(() => import("./admin-orgs.page"), "AdminOrgsPage"),
});
