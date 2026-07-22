import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../router/layouts";

export const pricingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "pricing",
  validateSearch: (s: Record<string, unknown>) => ({ plan: (s.plan as string) ?? undefined }),
  component: lazyRouteComponent(() => import("./pricing.page"), "PricingPage"),
});
