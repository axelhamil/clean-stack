import { Link } from "@tanstack/react-router";
import { AuthShell, AuthShellFooter } from "./_components/auth-shell";
import { SignUpForm } from "./_forms/sign-up-form";

export function SignUpPage() {
  return (
    <main>
      <AuthShell
        title="Create your account"
        description="Start building in under a minute."
        footer={
          <AuthShellFooter
            lead="Already have an account?"
            link={<Link to="/sign-in">Sign in</Link>}
          />
        }
      >
        <SignUpForm />
      </AuthShell>
    </main>
  );
}
