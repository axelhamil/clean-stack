import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { AuthShell, AuthShellFooter } from "./_components/auth-shell";
import { useVerifyMagicLink } from "./_hooks/use-verify-magic-link";

interface MagicLinkPageProps {
  token: string;
}

export function MagicLinkPage({ token }: MagicLinkPageProps) {
  const mutation = useVerifyMagicLink();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    mutation.mutate(token);
  }, [token, mutation.mutate]);

  return (
    <main>
      {mutation.isError ? (
        <MagicLinkError message={mutation.error.message} />
      ) : (
        <AuthShell title="Signing you in…" description="One moment.">
          <TypographyMuted>Verifying your link.</TypographyMuted>
        </AuthShell>
      )}
    </main>
  );
}

interface MagicLinkErrorProps {
  message: string;
}

function MagicLinkError({ message }: MagicLinkErrorProps) {
  return (
    <AuthShell
      title="Link invalid or expired"
      description={message}
      footer={
        <AuthShellFooter link={<Link to="/sign-in">Request a new link</Link>} />
      }
    >
      <TypographyMuted>
        Magic links are single-use and expire after a few minutes.
      </TypographyMuted>
    </AuthShell>
  );
}
