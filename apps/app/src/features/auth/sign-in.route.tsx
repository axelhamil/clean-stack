import { Button } from "@packages/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@packages/ui/components/ui/collapsible";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { Separator } from "@packages/ui/components/ui/separator";
import { createFileRoute, Link } from "@tanstack/react-router";
import { KeyRoundIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AuthShell, AuthShellFooter } from "./components/auth-shell";
import { EmailRequestForm } from "./forms/email-request-form";
import { SignInForm } from "./forms/sign-in-form";
import { useMagicLink } from "./hooks/use-magic-link";
import { useSignInSso } from "./hooks/use-sign-in-sso";

const signInSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/_guest/sign-in")({
  validateSearch: signInSearchSchema,
  component: SignInPage,
});

function SignInPage() {
  const { t } = useTranslation("auth");
  const { redirect } = Route.useSearch();
  const magicLinkMutation = useMagicLink();
  const ssoMutation = useSignInSso();
  const [ssoOpen, setSsoOpen] = useState(false);

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
      className="flex flex-col gap-6"
    >
      <SignInForm redirectTo={redirect} />

      <NavLink asChild className="ml-auto w-fit">
        <Link to="/forgot-password">{t("signIn.forgotPassword")}</Link>
      </NavLink>

      <Separator />
      <EmailRequestForm
        mutation={magicLinkMutation}
        submitLabel={t("signIn.magicLinkSubmit")}
        pendingLabel={t("signIn.magicLinkPending")}
        buttonVariant="outline"
      />

      <Collapsible open={ssoOpen} onOpenChange={setSsoOpen} className="flex flex-col gap-4">
        <CollapsibleTrigger asChild>
          <Button type="button" variant="outline" className="w-full">
            <KeyRoundIcon />
            {t("signIn.ssoTrigger")}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-4">
          <EmailRequestForm
            mutation={ssoMutation}
            submitLabel={t("signIn.ssoSubmit")}
            pendingLabel={t("signIn.ssoPending")}
            buttonVariant="outline"
          />
        </CollapsibleContent>
      </Collapsible>
    </AuthShell>
  );
}
