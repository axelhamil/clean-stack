import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { settingsLayout } from "../../router/layouts";

export const notificationsRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "notifications",
  component: lazyRouteComponent(() => import("./notifications.page"), "NotificationsPage"),
});
