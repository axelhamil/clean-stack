import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AuthShell, AuthShellFooter } from "./components/auth-shell";
import { useVerifyMagicLink } from "./hooks/use-verify-magic-link";

const magicLinkSearchSchema = z.object({
  token: z.string().min(1).optional(),
});

export const Route = createFileRoute("/magic-link")({
  validateSearch: magicLinkSearchSchema,
  beforeLoad: ({ search }) => {
    if (!search.token) throw redirect({ to: "/sign-in" });
  },
  component: MagicLinkPage,
});

function MagicLinkPage() {
  const { token } = Route.useSearch();
  if (!token) return null;

  return <ConsumeToken token={token} />;
}

interface ConsumeTokenProps {
  token: string;
}

function ConsumeToken({ token }: ConsumeTokenProps) {
  const { t } = useTranslation("auth");
  const mutation = useVerifyMagicLink();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    mutation.mutate(token);
  }, [token, mutation.mutate]);

  if (mutation.isError) return <MagicLinkError message={mutation.error.message} />;

  return (
    <AuthShell title={t("magicLink.signingInTitle")} description={t("magicLink.oneMoment")}>
      <TypographyMuted>{t("magicLink.verifyingLink")}</TypographyMuted>
    </AuthShell>
  );
}

interface MagicLinkErrorProps {
  message: string;
}

function MagicLinkError({ message }: MagicLinkErrorProps) {
  const { t } = useTranslation("auth");
  return (
    <AuthShell
      title={t("magicLink.invalidTitle")}
      description={message}
      footer={<AuthShellFooter link={<Link to="/sign-in">{t("magicLink.requestNewLink")}</Link>} />}
    >
      <TypographyMuted>{t("magicLink.expiryNotice")}</TypographyMuted>
    </AuthShell>
  );
}
