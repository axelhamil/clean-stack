import { Button } from "@packages/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@packages/ui/components/ui/collapsible";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { Separator } from "@packages/ui/components/ui/separator";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2Icon, KeyRoundIcon, MailIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AuthShell, AuthShellFooter } from "./components/auth-shell";
import { EmailRequestForm } from "./forms/email-request-form";
import { SignInForm } from "./forms/sign-in-form";
import { useMagicLink } from "./hooks/use-magic-link";
import { usePasskeyAutofill } from "./hooks/use-passkey-autofill";
import { usePasskeySupported } from "./hooks/use-passkey-supported";
import { useSignInPasskey } from "./hooks/use-sign-in-passkey";
import { useSignInSso } from "./hooks/use-sign-in-sso";

const signInSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/_guest/sign-in")({
  validateSearch: signInSearchSchema,
  component: SignInPage,
});

type EmailAlternative = "magicLink" | "sso";

function SignInPage() {
  const { t } = useTranslation("auth");
  const { redirect } = Route.useSearch();
  const magicLinkMutation = useMagicLink();
  const ssoMutation = useSignInSso();
  const passkey = useSignInPasskey(redirect);
  const support = usePasskeySupported();
  const autofill = usePasskeyAutofill({ enabled: support.conditional, redirectTo: redirect });
  const [openAlternative, setOpenAlternative] = useState<EmailAlternative | null>(null);

  const toggleAlternative = (alternative: EmailAlternative) => (open: boolean) =>
    setOpenAlternative(open ? alternative : null);

  return (
    <AuthShell
      title={t("signIn.title")}
      description={t("signIn.description")}
      footer={
        <AuthShellFooter
          lead={t("signIn.noAccountYet")}
          link={<Link to="/sign-up">{t("signIn.createOne")}</Link>}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <SignInForm redirectTo={redirect} passkeyAutofill={support.conditional} />

        <NavLink asChild className="w-fit">
          <Link to="/forgot-password">{t("signIn.forgotPassword")}</Link>
        </NavLink>
      </div>

      <Separator />

      <section className="flex flex-col gap-3">
        <TypographyMuted>{t("signIn.alternativesLabel")}</TypographyMuted>

        {support.available && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              autofill.abort();
              passkey.mutate();
            }}
            disabled={passkey.isPending}
          >
            <KeyRoundIcon />
            {passkey.isPending ? t("signIn.passkeyWaiting") : t("signIn.passkeyButton")}
          </Button>
        )}

        <Collapsible
          open={openAlternative === "magicLink"}
          onOpenChange={toggleAlternative("magicLink")}
          className="flex flex-col gap-4"
        >
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline" className="w-full">
              <MailIcon />
              {t("signIn.magicLinkTrigger")}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <EmailRequestForm
              mutation={magicLinkMutation}
              submitLabel={t("signIn.magicLinkSubmit")}
              pendingLabel={t("signIn.magicLinkPending")}
              buttonVariant="outline"
            />
          </CollapsibleContent>
        </Collapsible>

        <Collapsible
          open={openAlternative === "sso"}
          onOpenChange={toggleAlternative("sso")}
          className="flex flex-col gap-4"
        >
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline" className="w-full">
              <Building2Icon />
              {t("signIn.ssoTrigger")}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <EmailRequestForm
              mutation={ssoMutation}
              submitLabel={t("signIn.ssoSubmit")}
              pendingLabel={t("signIn.ssoPending")}
              buttonVariant="outline"
            />
          </CollapsibleContent>
        </Collapsible>
      </section>
    </AuthShell>
  );
}
