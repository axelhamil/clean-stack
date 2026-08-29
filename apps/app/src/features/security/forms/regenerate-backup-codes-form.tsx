import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { BackupCodesPanel } from "../components/backup-codes-panel";
import { useGenerateBackupCodes } from "../hooks/use-generate-backup-codes";
import { type PasswordPromptInput, passwordPromptSchema } from "../security.schema";

interface RegenerateBackupCodesFormProps {
  onDone?: () => void;
}

export function RegenerateBackupCodesForm({ onDone }: RegenerateBackupCodesFormProps = {}) {
  const { t } = useTranslation("settings");
  const [codes, setCodes] = useState<string[] | null>(null);

  if (codes) {
    return (
      <div className="flex flex-col gap-4">
        <BackupCodesPanel codes={codes} />
        <Button type="button" className="w-full" onClick={() => onDone?.()}>
          {t("recoveryCodes.done")}
        </Button>
      </div>
    );
  }

  return <PasswordStep onCodes={setCodes} />;
}

interface PasswordStepProps {
  onCodes: (codes: string[]) => void;
}

function PasswordStep({ onCodes }: PasswordStepProps) {
  const { t } = useTranslation("settings");
  const mutation = useGenerateBackupCodes();
  const form = useForm<PasswordPromptInput>({
    resolver: zodResolver(passwordPromptSchema),
    defaultValues: { password: "" },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values, { onSuccess: onCodes }))}
        className="flex flex-col gap-4"
        noValidate
      >
        <TypographyMuted>{t("recoveryCodes.confirmPasswordPrompt")}</TypographyMuted>
        <FormTextField
          control={form.control}
          name="password"
          label={t("twoFactor.passwordLabel")}
          type="password"
          autoComplete="current-password"
          placeholder={t("twoFactor.passwordPlaceholder")}
        />
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? t("recoveryCodes.generating") : t("recoveryCodes.regenerate")}
        </Button>
      </form>
    </Form>
  );
}
