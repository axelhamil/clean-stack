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
  const { redirect } = Route.useSearch();
  const magicLinkMutation = useMagicLink();
  const ssoMutation = useSignInSso();
  const [ssoOpen, setSsoOpen] = useState(false);

  return (
    <AuthShell
      title="Sign in"
      description="Welcome back. Enter your details to continue."
      footer={
        <AuthShellFooter lead="No account yet?" link={<Link to="/sign-up">Create one</Link>} />
      }
      className="flex flex-col gap-6"
    >
      <SignInForm redirectTo={redirect} />

      <NavLink asChild className="ml-auto w-fit">
        <Link to="/forgot-password">Forgot password?</Link>
      </NavLink>

      <Separator />
      <EmailRequestForm
        mutation={magicLinkMutation}
        submitLabel="Email me a magic link"
        pendingLabel="Sending…"
        buttonVariant="outline"
      />

      <Collapsible open={ssoOpen} onOpenChange={setSsoOpen} className="flex flex-col gap-4">
        <CollapsibleTrigger asChild>
          <Button type="button" variant="outline" className="w-full">
            <KeyRoundIcon />
            Sign in with SSO
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-4">
          <EmailRequestForm
            mutation={ssoMutation}
            submitLabel="Continue"
            pendingLabel="Redirecting…"
            buttonVariant="outline"
          />
        </CollapsibleContent>
      </Collapsible>
    </AuthShell>
  );
}
