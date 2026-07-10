import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../router/layouts";

export const cookiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "legal/cookies",
  component: lazyRouteComponent(() => import("./cookies.page"), "CookiesPage"),
});
