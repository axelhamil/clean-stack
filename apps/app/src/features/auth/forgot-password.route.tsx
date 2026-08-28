import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

export const Route = createFileRoute("/_guest/forgot-password")({
  component: lazyRouteComponent(() => import("./forgot-password.page"), "ForgotPasswordPage"),
});
