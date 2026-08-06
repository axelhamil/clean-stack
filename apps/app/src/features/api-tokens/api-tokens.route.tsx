import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { settingsLayout } from "../../router/layouts";

export const apiTokensRoute = createRoute({
  getParentRoute: () => settingsLayout,
  path: "api-tokens",
  component: lazyRouteComponent(() => import("./api-tokens.page"), "ApiTokensPage"),
});
