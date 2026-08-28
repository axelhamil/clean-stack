import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/developers/events")({
  component: lazyRouteComponent(() => import("./events.page"), "DevelopersEventsPage"),
});
