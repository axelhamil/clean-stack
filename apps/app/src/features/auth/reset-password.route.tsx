import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { z } from "zod";

const resetPasswordSearchSchema = z.object({
  token: z.string().min(1).optional(),
});

export const Route = createFileRoute("/reset-password")({
  validateSearch: resetPasswordSearchSchema,
  beforeLoad: ({ search }) => {
    if (!search.token) throw redirect({ to: "/forgot-password" });
  },
  component: lazyRouteComponent(() => import("./reset-password.page"), "ResetPasswordPage"),
});
