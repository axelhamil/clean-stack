import { Link } from "@tanstack/react-router";
import { AuthShell, AuthShellFooter } from "./_components/auth-shell";
import { ForgotPasswordForm } from "./_forms/forgot-password-form";

export function ForgotPasswordPage() {
  return (
    <main>
      <AuthShell
        title="Reset your password"
        description="Enter your email — we'll send you a reset link."
        footer={
          <AuthShellFooter
            lead="Remembered it?"
            link={<Link to="/sign-in">Back to sign in</Link>}
          />
        }
      >
        <ForgotPasswordForm />
      </AuthShell>
    </main>
  );
}
