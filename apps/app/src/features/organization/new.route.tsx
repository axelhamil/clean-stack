import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { shellLayout } from "../../router/layouts";

export const newOrgRoute = createRoute({
  getParentRoute: () => shellLayout,
  path: "org/new",
  component: lazyRouteComponent(() => import("./new.page"), "CreateOrgPage"),
});
