import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { createRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { rootRoute } from "../../router/layouts";
import { sessionQueryOptions } from "../../shared/api/queries/session";
import { AuthShell, AuthShellFooter } from "./components/auth-shell";
import { useVerifyEmail } from "./hooks/use-verify-email";

const verifyEmailSearchSchema = z.object({
  token: z.string().min(1).optional(),
});

export const verifyEmailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "verify-email",
  validateSearch: verifyEmailSearchSchema,
  beforeLoad: async ({ context, search }) => {
    if (search.token) return;
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    if (session) throw redirect({ to: "/dashboard" });
  },
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { token } = verifyEmailRoute.useSearch();
  return <main>{token ? <ConsumeToken token={token} /> : <CheckInbox />}</main>;
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
