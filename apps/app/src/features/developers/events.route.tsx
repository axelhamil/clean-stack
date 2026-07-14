import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../router/layouts";

export const developersEventsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "developers/events",
  component: lazyRouteComponent(() => import("./events.page"), "DevelopersEventsPage"),
});
