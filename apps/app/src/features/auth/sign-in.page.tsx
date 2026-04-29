import { NavLink } from "@packages/ui/components/ui/nav-link";
import { Separator } from "@packages/ui/components/ui/separator";
import { Link } from "@tanstack/react-router";
import { AuthShell, AuthShellFooter } from "./_components/auth-shell";
import { MagicLinkForm } from "./_forms/magic-link-form";
import { SignInForm } from "./_forms/sign-in-form";

interface SignInPageProps {
  redirectTo?: string;
}

export function SignInPage({ redirectTo }: SignInPageProps = {}) {
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
        <MagicLinkForm />
      </AuthShell>
    </main>
  );
}
