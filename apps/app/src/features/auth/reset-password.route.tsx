import { createRoute, Link, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { rootRoute } from "../../router/layouts";
import { AuthShell, AuthShellFooter } from "./components/auth-shell";
import { ResetPasswordForm } from "./forms/reset-password-form";

const resetPasswordSearchSchema = z.object({
  token: z.string().min(1).optional(),
});

export const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "reset-password",
  validateSearch: resetPasswordSearchSchema,
  beforeLoad: ({ search }) => {
    if (!search.token) throw redirect({ to: "/forgot-password" });
  },
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token } = resetPasswordRoute.useSearch();
  if (!token) return null;

  return (
    <main>
      <AuthShell
        title="Set a new password"
        description="Choose a new password for your account."
        footer={
          <AuthShellFooter
            lead="Changed your mind?"
            link={<Link to="/sign-in">Back to sign in</Link>}
          />
        }
      >
        <ResetPasswordForm token={token} />
      </AuthShell>
    </main>
  );
}
