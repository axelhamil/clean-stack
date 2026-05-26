import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { AuthShell, AuthShellFooter } from "./components/auth-shell";
import { useVerifyMagicLink } from "./hooks/use-verify-magic-link";

const route = getRouteApi("/magic-link");

export function MagicLinkPage() {
  const { token } = route.useSearch();
  if (!token) return null;

  return <ConsumeToken token={token} />;
}

interface ConsumeTokenProps {
  token: string;
}

function ConsumeToken({ token }: ConsumeTokenProps) {
  const mutation = useVerifyMagicLink();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    mutation.mutate(token);
  }, [token, mutation.mutate]);

  if (mutation.isError) return <MagicLinkError message={mutation.error.message} />;

  return (
    <AuthShell title="Signing you in…" description="One moment.">
      <TypographyMuted>Verifying your link.</TypographyMuted>
    </AuthShell>
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
      footer={<AuthShellFooter link={<Link to="/sign-in">Request a new link</Link>} />}
    >
      <TypographyMuted>Magic links are single-use and expire after a few minutes.</TypographyMuted>
    </AuthShell>
  );
}
