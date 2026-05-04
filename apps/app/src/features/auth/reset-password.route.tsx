import { createRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { rootRoute } from "../../router/layouts";

const resetPasswordSearchSchema = z.object({
  token: z.string().min(1).optional(),
});

export const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "reset-password",
  validateSearch: resetPasswordSearchSchema,
  beforeLoad: ({ search }) => {
    if (!search.token) throw redirect({ to: "/forgot-password" });
  },
  component: lazyRouteComponent(() => import("./reset-password.page"), "ResetPasswordPage"),
});
