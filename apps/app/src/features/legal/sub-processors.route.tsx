import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../router/layouts";

export const subProcessorsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "legal/sub-processors",
  component: lazyRouteComponent(() => import("./sub-processors.page"), "SubProcessorsPage"),
});
