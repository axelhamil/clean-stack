import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/legal/data-rights")({
  component: lazyRouteComponent(() => import("./data-rights.page"), "DataRightsPage"),
});
