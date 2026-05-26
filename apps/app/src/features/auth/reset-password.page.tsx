import { getRouteApi, Link } from "@tanstack/react-router";
import { AuthShell, AuthShellFooter } from "./components/auth-shell";
import { ResetPasswordForm } from "./forms/reset-password-form";

const route = getRouteApi("/reset-password");

export function ResetPasswordPage() {
  const { token } = route.useSearch();
  if (!token) return null;

  return (
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
  );
}
