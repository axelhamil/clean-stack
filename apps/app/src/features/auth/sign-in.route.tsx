import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { z } from "zod";
import { guestLayout } from "../../router/layouts";

const signInSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const signInRoute = createRoute({
  getParentRoute: () => guestLayout,
  path: "sign-in",
  validateSearch: signInSearchSchema,
  component: lazyRouteComponent(() => import("./sign-in.page"), "SignInPage"),
});
