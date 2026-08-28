import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_guest/sign-up")({
  component: lazyRouteComponent(() => import("./sign-up.page"), "SignUpPage"),
});
