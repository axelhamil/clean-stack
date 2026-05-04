import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { createRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { rootRoute } from "../../router/layouts";
import { AuthShell, AuthShellFooter } from "./components/auth-shell";
import { useVerifyMagicLink } from "./hooks/use-verify-magic-link";

const magicLinkSearchSchema = z.object({
  token: z.string().min(1).optional(),
});

export const magicLinkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "magic-link",
  validateSearch: magicLinkSearchSchema,
  beforeLoad: ({ search }) => {
    if (!search.token) throw redirect({ to: "/sign-in" });
  },
  component: MagicLinkPage,
});

function MagicLinkPage() {
  const { token } = magicLinkRoute.useSearch();
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
      footer={<AuthShellFooter link={<Link to="/sign-in">Request a new link</Link>} />}
    >
      <TypographyMuted>Magic links are single-use and expire after a few minutes.</TypographyMuted>
    </AuthShell>
  );
}
