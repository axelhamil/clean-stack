import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { guestLayout } from "../../router/layouts";

export const forgotPasswordRoute = createRoute({
  getParentRoute: () => guestLayout,
  path: "forgot-password",
  component: lazyRouteComponent(() => import("./forgot-password.page"), "ForgotPasswordPage"),
});
