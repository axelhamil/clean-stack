import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { sessionQueryOptions } from "../../shared/api/queries/session";
import { AuthShell, AuthShellFooter } from "./components/auth-shell";
import { useVerifyEmail } from "./hooks/use-verify-email";

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
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { token } = Route.useSearch();
  return token ? <ConsumeToken token={token} /> : <CheckInbox />;
}

interface ConsumeTokenProps {
  token: string;
}

function ConsumeToken({ token }: ConsumeTokenProps) {
  const { t } = useTranslation("auth");
  const mutation = useVerifyEmail();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    mutation.mutate(token);
  }, [token, mutation.mutate]);

  if (mutation.isError) return <VerifyEmailError message={mutation.error.message} />;

  return (
    <AuthShell title={t("verifyEmail.verifyingTitle")} description={t("verifyEmail.oneMoment")}>
      <TypographyMuted>{t("verifyEmail.hangTight")}</TypographyMuted>
    </AuthShell>
  );
}

interface VerifyEmailErrorProps {
  message: string;
}

function VerifyEmailError({ message }: VerifyEmailErrorProps) {
  const { t } = useTranslation("auth");
  return (
    <AuthShell
      title={t("verifyEmail.failedTitle")}
      description={message}
      footer={<AuthShellFooter link={<Link to="/sign-in">{t("backToSignIn")}</Link>} />}
    >
      <TypographyMuted>{t("verifyEmail.expiredOrUsed")}</TypographyMuted>
    </AuthShell>
  );
}

function CheckInbox() {
  const { t } = useTranslation("auth");
  return (
    <AuthShell
      title={t("verifyEmail.checkInboxTitle")}
      description={t("verifyEmail.checkInboxDescription")}
      footer={
        <AuthShellFooter
          lead={t("verifyEmail.wrongEmail")}
          link={<Link to="/sign-up">{t("verifyEmail.signUpAgain")}</Link>}
        />
      }
    >
      <TypographyMuted>{t("verifyEmail.expiryHelp")}</TypographyMuted>
    </AuthShell>
  );
}
