import { NavLink } from "@packages/ui/components/ui/nav-link";
import { Separator } from "@packages/ui/components/ui/separator";
import { createRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { guestLayout } from "../../router/layouts";
import { AuthShell, AuthShellFooter } from "./components/auth-shell";
import { EmailRequestForm } from "./forms/email-request-form";
import { SignInForm } from "./forms/sign-in-form";
import { useMagicLink } from "./hooks/use-magic-link";

const signInSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const signInRoute = createRoute({
  getParentRoute: () => guestLayout,
  path: "sign-in",
  validateSearch: signInSearchSchema,
  component: SignInPage,
});

function SignInPage() {
  const { redirect } = signInRoute.useSearch();
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
        <SignInForm redirectTo={redirect} />

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
