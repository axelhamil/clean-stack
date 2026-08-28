import { createFileRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { sessionQueryOptions } from "../../shared/api/queries/session";

const verifyEmailSearchSchema = z.object({
  token: z.string().min(1).optional(),
});

export const Route = createFileRoute("/verify-email")({
  validateSearch: verifyEmailSearchSchema,
  beforeLoad: async ({ context, search }) => {
    if (search.token) return;
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    if (session) throw redirect({ to: "/dashboard" });
  },
  component: lazyRouteComponent(() => import("./verify-email.page"), "VerifyEmailPage"),
});
