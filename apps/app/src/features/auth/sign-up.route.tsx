import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AuthShell, AuthShellFooter } from "./components/auth-shell";
import { SignUpForm } from "./forms/sign-up-form";

export const Route = createFileRoute("/_guest/sign-up")({
  component: SignUpPage,
});

function SignUpPage() {
  const { t } = useTranslation("auth");
  return (
    <AuthShell
      title={t("signUp.title")}
      description={t("signUp.description")}
      footer={
        <AuthShellFooter
          lead={t("signUp.alreadyHaveAccount")}
          link={<Link to="/sign-in">{t("signIn.submit")}</Link>}
        />
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
