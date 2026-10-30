import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { redirectSearchSchema } from "../../shared/auth/safe-redirect";
import { AuthShell, AuthShellFooter } from "./components/auth-shell";
import { SignUpForm } from "./forms/sign-up-form";

export const Route = createFileRoute("/_guest/sign-up")({
  validateSearch: redirectSearchSchema,
  component: SignUpPage,
});

function SignUpPage() {
  const { t } = useTranslation("auth");
  const { redirect } = Route.useSearch();

  return (
    <AuthShell
      title={t("signUp.title")}
      description={t("signUp.description")}
      footer={
        <AuthShellFooter
          lead={t("signUp.alreadyHaveAccount")}
          link={
            <Link to="/sign-in" search={{ redirect }}>
              {t("signIn.submit")}
            </Link>
          }
        />
      }
    >
      <SignUpForm redirectTo={redirect} />
    </AuthShell>
  );
}
