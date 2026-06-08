import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { z } from "zod";
import { protectedLayout } from "../../router/layouts";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const acceptPoliciesRoute = createRoute({
  getParentRoute: () => protectedLayout,
  path: "legal/accept",
  validateSearch: searchSchema,
  component: lazyRouteComponent(() => import("./accept.page"), "AcceptPoliciesPage"),
});
