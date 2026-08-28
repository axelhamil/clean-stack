import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_shell/settings/_org-scope/organization")({
  component: lazyRouteComponent(() => import("./organization.page"), "OrganizationPage"),
});
