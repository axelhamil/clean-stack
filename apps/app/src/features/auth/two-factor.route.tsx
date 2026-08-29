import { Button } from "@packages/ui/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("auth");
  const { redirect } = Route.useSearch();
  const [method, setMethod] = useState<"totp" | "backup">("totp");

  return (
    <AuthShell
      title={t("twoFactor.title")}
      description={
        method === "totp" ? t("twoFactor.descriptionTotp") : t("twoFactor.descriptionBackup")
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
        {method === "totp" ? t("twoFactor.useRecoveryCode") : t("twoFactor.useAuthenticatorApp")}
      </Button>
    </AuthShell>
  );
}
