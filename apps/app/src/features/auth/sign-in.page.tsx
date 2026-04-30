import { NavLink } from "@packages/ui/components/ui/nav-link";
import { Separator } from "@packages/ui/components/ui/separator";
import { Link } from "@tanstack/react-router";
import { AuthShell, AuthShellFooter } from "./_components/auth-shell";
import { EmailRequestForm } from "./_forms/email-request-form";
import { SignInForm } from "./_forms/sign-in-form";
import { useMagicLink } from "./_hooks/use-magic-link";

interface SignInPageProps {
  redirectTo?: string;
}

export function SignInPage({ redirectTo }: SignInPageProps = {}) {
  const magicLinkMutation = useMagicLink();

  return (
    <main>
      <AuthShell
        title="Sign in"
        description="Welcome back. Enter your details to continue."
        footer={
          <AuthShellFooter lead="No account yet?" link={<Link to="/sign-up">Create one</Link>} />
        }
        className="flex flex-col gap-6"
      >
        <SignInForm redirectTo={redirectTo} />

        <NavLink asChild className={"w-fit ml-auto"}>
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
    </main>
  );
}
