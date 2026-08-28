import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_shell/settings/privacy")({
  component: lazyRouteComponent(() => import("./privacy.page"), "PrivacyPage"),
});
