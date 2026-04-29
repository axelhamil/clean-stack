import { Link } from "@tanstack/react-router";
import { AuthShell, AuthShellFooter } from "./_components/auth-shell";
import { ResetPasswordForm } from "./_forms/reset-password-form";

interface ResetPasswordPageProps {
  token: string;
}

export function ResetPasswordPage({ token }: ResetPasswordPageProps) {
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
