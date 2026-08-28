import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/legal/terms")({
  component: lazyRouteComponent(() => import("./terms.page"), "TermsPage"),
});
