import { NavLink } from "@packages/ui/components/ui/nav-link";
import { Separator } from "@packages/ui/components/ui/separator";
import { getRouteApi, Link } from "@tanstack/react-router";
import { AuthShell, AuthShellFooter } from "./components/auth-shell";
import { EmailRequestForm } from "./forms/email-request-form";
import { SignInForm } from "./forms/sign-in-form";
import { useMagicLink } from "./hooks/use-magic-link";

const route = getRouteApi("/_guest/sign-in");

export function SignInPage() {
  const { redirect } = route.useSearch();
  const magicLinkMutation = useMagicLink();

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
    </AuthShell>
  );
}
