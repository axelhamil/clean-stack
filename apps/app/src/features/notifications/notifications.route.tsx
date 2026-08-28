import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_shell/settings/notifications")({
  component: lazyRouteComponent(() => import("./notifications.page"), "NotificationsPage"),
});
