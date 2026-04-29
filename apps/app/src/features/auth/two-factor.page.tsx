import { AuthShell } from "./_components/auth-shell";
import { TwoFactorForm } from "./_forms/two-factor-form";

interface TwoFactorPageProps {
  redirectTo?: string;
}

export function TwoFactorPage({ redirectTo }: TwoFactorPageProps = {}) {
  return (
    <main>
      <AuthShell
        title="Two-factor authentication"
        description="Enter the 6-digit code from your authenticator app."
      >
        <TwoFactorForm redirectTo={redirectTo} />
      </AuthShell>
    </main>
  );
}
