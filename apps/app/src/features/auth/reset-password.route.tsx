import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AuthShell, AuthShellFooter } from "./components/auth-shell";
import { ResetPasswordForm } from "./forms/reset-password-form";

const resetPasswordSearchSchema = z.object({
  token: z.string().min(1).optional(),
});

export const Route = createFileRoute("/reset-password")({
  validateSearch: resetPasswordSearchSchema,
  beforeLoad: ({ search }) => {
    if (!search.token) throw redirect({ to: "/forgot-password" });
  },
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useTranslation("auth");
  const { token } = Route.useSearch();
  if (!token) return null;

  return (
    <AuthShell
      title={t("resetPassword.title")}
      description={t("resetPassword.description")}
      footer={
        <AuthShellFooter
          lead={t("resetPassword.changedYourMind")}
          link={<Link to="/sign-in">{t("backToSignIn")}</Link>}
        />
      }
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
