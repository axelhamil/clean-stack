import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { ResetPasswordPage } from "../features/auth/reset-password.page";

const resetPasswordSearchSchema = z.object({
  token: z.string().min(1).optional(),
});

export const Route = createFileRoute("/reset-password")({
  validateSearch: resetPasswordSearchSchema,
  beforeLoad: ({ search }) => {
    if (!search.token) throw redirect({ to: "/forgot-password" });
  },
  component: () => {
    const { token } = Route.useSearch();
    if (!token) return null;

    return <ResetPasswordPage token={token} />;
  },
});
