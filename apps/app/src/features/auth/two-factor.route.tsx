import { createRoute } from "@tanstack/react-router";
import { z } from "zod";
import { rootRoute } from "../../router/layouts";
import { AuthShell } from "./components/auth-shell";
import { TwoFactorForm } from "./forms/two-factor-form";

const twoFactorSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const twoFactorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "two-factor",
  validateSearch: twoFactorSearchSchema,
  component: TwoFactorPage,
});

function TwoFactorPage() {
  const { redirect } = twoFactorRoute.useSearch();

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
