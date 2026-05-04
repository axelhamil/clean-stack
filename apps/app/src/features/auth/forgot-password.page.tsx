import { Link } from "@tanstack/react-router";
import { AuthShell, AuthShellFooter } from "./components/auth-shell";
import { EmailRequestForm } from "./forms/email-request-form";
import { useForgotPassword } from "./hooks/use-forgot-password";

export function ForgotPasswordPage() {
  const mutation = useForgotPassword();

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
        <EmailRequestForm
          mutation={mutation}
          submitLabel="Send reset link"
          pendingLabel="Sending…"
        />
      </AuthShell>
    </main>
  );
}
