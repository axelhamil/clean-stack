import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { adminLayout } from "../../router/layouts";

export const adminAuditLogRoute = createRoute({
  getParentRoute: () => adminLayout,
  path: "admin/audit-log",
  component: lazyRouteComponent(() => import("./admin-audit-log.page"), "AdminAuditLogPage"),
});
