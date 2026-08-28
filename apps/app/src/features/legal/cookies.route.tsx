import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/legal/cookies")({
  component: lazyRouteComponent(() => import("./cookies.page"), "CookiesPage"),
});
