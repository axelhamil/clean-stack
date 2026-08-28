import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_shell/org/new")({
  component: lazyRouteComponent(() => import("./new.page"), "CreateOrgPage"),
});
