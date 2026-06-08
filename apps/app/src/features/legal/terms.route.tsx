import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../router/layouts";

export const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "legal/terms",
  component: lazyRouteComponent(() => import("./terms.page"), "TermsPage"),
});
