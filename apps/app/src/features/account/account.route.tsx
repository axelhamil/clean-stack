import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { settingsLayout } from "../../router/layouts";

export const accountRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "account",
  component: lazyRouteComponent(() => import("./account.page"), "AccountPage"),
});
