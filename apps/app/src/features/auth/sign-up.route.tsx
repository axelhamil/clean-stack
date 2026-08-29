import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthShell, AuthShellFooter } from "./components/auth-shell";
import { SignUpForm } from "./forms/sign-up-form";

export const Route = createFileRoute("/_guest/sign-up")({
  component: SignUpPage,
});

function SignUpPage() {
  return (
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
  );
}
