import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { orgScopeLayout } from "../../router/layouts";

export const teamRoute = createRoute({
  getParentRoute: () => orgScopeLayout,
  path: "team",
  component: lazyRouteComponent(() => import("./team.page"), "TeamPage"),
});
