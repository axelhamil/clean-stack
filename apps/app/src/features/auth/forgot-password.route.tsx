import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AuthShell, AuthShellFooter } from "./components/auth-shell";
import { EmailRequestForm } from "./forms/email-request-form";
import { useForgotPassword } from "./hooks/use-forgot-password";

export const Route = createFileRoute("/_guest/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { t } = useTranslation("auth");
  const mutation = useForgotPassword();

  return (
    <AuthShell
      title={t("forgotPassword.title")}
      description={t("forgotPassword.description")}
      footer={
        <AuthShellFooter
          lead={t("forgotPassword.rememberedIt")}
          link={<Link to="/sign-in">{t("backToSignIn")}</Link>}
        />
      }
    >
      <EmailRequestForm
        mutation={mutation}
        submitLabel={t("forgotPassword.submit")}
        pendingLabel={t("forgotPassword.pending")}
      />
    </AuthShell>
  );
}
