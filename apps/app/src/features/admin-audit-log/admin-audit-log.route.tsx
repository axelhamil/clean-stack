import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_shell/_admin/admin/audit-log")({
  component: lazyRouteComponent(() => import("./admin-audit-log.page"), "AdminAuditLogPage"),
});
