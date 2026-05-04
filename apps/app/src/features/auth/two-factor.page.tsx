import { getRouteApi } from "@tanstack/react-router";
import { AuthShell } from "./components/auth-shell";
import { TwoFactorForm } from "./forms/two-factor-form";

const route = getRouteApi("/two-factor");

export function TwoFactorPage() {
  const { redirect } = route.useSearch();

  return (
    <main>
      <AuthShell
        title="Two-factor authentication"
        description="Enter the 6-digit code from your authenticator app."
      >
        <TwoFactorForm redirectTo={redirect} />
      </AuthShell>
    </main>
  );
}
