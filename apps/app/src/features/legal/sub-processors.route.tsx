import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/legal/sub-processors")({
  component: lazyRouteComponent(() => import("./sub-processors.page"), "SubProcessorsPage"),
});
