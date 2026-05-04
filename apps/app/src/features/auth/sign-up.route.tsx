import { createRoute, Link } from "@tanstack/react-router";
import { guestLayout } from "../../router/layouts";
import { AuthShell, AuthShellFooter } from "./components/auth-shell";
import { SignUpForm } from "./forms/sign-up-form";

export const signUpRoute = createRoute({
  getParentRoute: () => guestLayout,
  path: "sign-up",
  component: SignUpPage,
});

function SignUpPage() {
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
