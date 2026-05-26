import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { AuthShell, AuthShellFooter } from "./components/auth-shell";
import { useVerifyEmail } from "./hooks/use-verify-email";

const route = getRouteApi("/verify-email");

export function VerifyEmailPage() {
  const { token } = route.useSearch();
  return token ? <ConsumeToken token={token} /> : <CheckInbox />;
}

interface ConsumeTokenProps {
  token: string;
}

function ConsumeToken({ token }: ConsumeTokenProps) {
  const mutation = useVerifyEmail();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    mutation.mutate(token);
  }, [token, mutation.mutate]);

  if (mutation.isError) return <VerifyEmailError message={mutation.error.message} />;

  return (
    <AuthShell title="Verifying your email…" description="One moment.">
      <TypographyMuted>Hang tight.</TypographyMuted>
    </AuthShell>
  );
}

interface VerifyEmailErrorProps {
  message: string;
}

function VerifyEmailError({ message }: VerifyEmailErrorProps) {
  return (
    <AuthShell
      title="Verification failed"
      description={message}
      footer={<AuthShellFooter link={<Link to="/sign-in">Back to sign in</Link>} />}
    >
      <TypographyMuted>The link may have expired or already been used.</TypographyMuted>
    </AuthShell>
  );
}

function CheckInbox() {
  return (
    <AuthShell
      title="Check your inbox"
      description="We sent you a verification link. Click it to activate your account."
      footer={
        <AuthShellFooter lead="Wrong email?" link={<Link to="/sign-up">Sign up again</Link>} />
      }
    >
      <TypographyMuted>
        The link expires after a short while. If it's missing, check spam or request a new one from
        the sign-in page.
      </TypographyMuted>
    </AuthShell>
  );
}
