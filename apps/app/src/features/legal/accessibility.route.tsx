import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../router/layouts";

export const accessibilityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "legal/accessibility",
  component: lazyRouteComponent(() => import("./accessibility.page"), "AccessibilityPage"),
});
