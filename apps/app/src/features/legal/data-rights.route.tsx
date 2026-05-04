import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "../../router/layouts";

export const dataRightsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "legal/data-rights",
  component: lazyRouteComponent(() => import("./data-rights.page"), "DataRightsPage"),
});
