import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { z } from "zod";
import { rootRoute } from "../../router/layouts";

const twoFactorSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const twoFactorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "two-factor",
  validateSearch: twoFactorSearchSchema,
  component: lazyRouteComponent(() => import("./two-factor.page"), "TwoFactorPage"),
});
