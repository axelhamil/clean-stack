import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { guestLayout } from "../../router/layouts";

export const signUpRoute = createRoute({
  getParentRoute: () => guestLayout,
  path: "sign-up",
  component: lazyRouteComponent(() => import("./sign-up.page"), "SignUpPage"),
});
