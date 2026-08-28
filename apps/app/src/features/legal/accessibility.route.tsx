import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/legal/accessibility")({
  component: lazyRouteComponent(() => import("./accessibility.page"), "AccessibilityPage"),
});
