import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { redirectSearchSchema } from "@packages/web-kit/auth/safe-redirect";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AuthShell, AuthShellFooter } from "./components/auth-shell";
import { useConsumeToken } from "./hooks/use-consume-token";
import { useVerifyMagicLink } from "./hooks/use-verify-magic-link";

const magicLinkSearchSchema = redirectSearchSchema.extend({
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
  const { token, redirect: redirectTo } = Route.useSearch();
  if (!token) return null;

  return <ConsumeToken token={token} redirectTo={redirectTo} />;
}

interface ConsumeTokenProps {
  token: string;
  redirectTo: string | undefined;
}

function ConsumeToken({ token, redirectTo }: ConsumeTokenProps) {
  const { t } = useTranslation("auth");
  const mutation = useVerifyMagicLink(redirectTo);
  useConsumeToken(token, mutation.mutate);

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
