import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../router/layouts";

export const privacyPolicyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "legal/privacy-policy",
  component: lazyRouteComponent(() => import("./privacy-policy.page"), "PrivacyPolicyPage"),
});
