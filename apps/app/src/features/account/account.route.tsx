import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_shell/settings/account")({
  component: lazyRouteComponent(() => import("./account.page"), "AccountPage"),
});
