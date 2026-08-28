import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_shell/settings/api-tokens")({
  component: lazyRouteComponent(() => import("./api-tokens.page"), "ApiTokensPage"),
});
