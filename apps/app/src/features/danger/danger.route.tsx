import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { settingsLayout } from "../../router/layouts";

export const dangerRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "danger",
  component: lazyRouteComponent(() => import("./danger.page"), "DangerPage"),
});
