import { Button } from "@packages/ui/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AuthShell } from "./components/auth-shell";
import { BackupCodeForm } from "./forms/backup-code-form";
import { TwoFactorForm } from "./forms/two-factor-form";

const twoFactorSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/two-factor")({
  validateSearch: twoFactorSearchSchema,
  component: TwoFactorPage,
});

function TwoFactorPage() {
  const { redirect } = Route.useSearch();
  const [method, setMethod] = useState<"totp" | "backup">("totp");

  return (
    <AuthShell
      title="Two-factor authentication"
      description={
        method === "totp"
          ? "Enter the 6-digit code from your authenticator app."
          : "Enter one of your one-time recovery codes."
      }
    >
      {method === "totp" ? (
        <TwoFactorForm redirectTo={redirect} />
      ) : (
        <BackupCodeForm redirectTo={redirect} />
      )}
      <Button
        type="button"
        variant="link"
        className="w-full"
        onClick={() => setMethod(method === "totp" ? "backup" : "totp")}
      >
        {method === "totp" ? "Use a recovery code instead" : "Use authenticator app"}
      </Button>
    </AuthShell>
  );
}
