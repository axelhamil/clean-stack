import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { QrCodeFrame } from "@packages/ui/components/ui/qr-code-frame";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { BackupCodesPanel } from "../components/backup-codes-panel";
import { type EnableTwoFactorResult, useEnableTwoFactor } from "../hooks/use-enable-two-factor";
import { useVerifyTwoFactorSetup } from "../hooks/use-verify-two-factor-setup";
import {
  type PasswordPromptInput,
  passwordPromptSchema,
  type VerifyTotpSetupInput,
  verifyTotpSetupSchema,
} from "../security.schema";

interface EnableTwoFactorFormProps {
  onSuccess?: () => void;
}

export function EnableTwoFactorForm({ onSuccess }: EnableTwoFactorFormProps = {}) {
  const [setup, setSetup] = useState<EnableTwoFactorResult | null>(null);

  if (!setup) return <PasswordStep onSetup={setSetup} />;

  return <ConfirmStep setup={setup} onSuccess={onSuccess} />;
}

interface PasswordStepProps {
  onSetup: (result: EnableTwoFactorResult) => void;
}

function PasswordStep({ onSetup }: PasswordStepProps) {
  const { t } = useTranslation("settings");
  const mutation = useEnableTwoFactor();
  const form = useForm<PasswordPromptInput>({
    resolver: zodResolver(passwordPromptSchema),
    defaultValues: { password: "" },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values, { onSuccess: onSetup }))}
        className="flex flex-col gap-4"
        noValidate
      >
        <TypographyMuted>{t("twoFactor.confirmPasswordPrompt")}</TypographyMuted>
        <FormTextField
          control={form.control}
          name="password"
          label={t("twoFactor.passwordLabel")}
          type="password"
          autoComplete="current-password"
          placeholder={t("twoFactor.passwordPlaceholder")}
        />
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? t("twoFactor.generating") : t("twoFactor.continue")}
        </Button>
      </form>
    </Form>
  );
}

interface ConfirmStepProps {
  setup: EnableTwoFactorResult;
  onSuccess?: () => void;
}

function ConfirmStep({ setup, onSuccess }: ConfirmStepProps) {
  const { t } = useTranslation("settings");
  const mutation = useVerifyTwoFactorSetup();
  const form = useForm<VerifyTotpSetupInput>({
    resolver: zodResolver(verifyTotpSetupSchema),
    defaultValues: { code: "" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3">
        <QrCodeFrame>
          {/* qrcode.react defaults to black-on-white, which is what we need on QrCodeFrame's
              fixed white background to keep modules legible across light/dark themes. */}
          <QRCodeSVG value={setup.totpURI} size={176} marginSize={4} />
        </QrCodeFrame>
        <TypographyMuted className="text-center">{t("twoFactor.scanPrompt")}</TypographyMuted>
      </div>

      <BackupCodesPanel codes={setup.backupCodes} />

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) =>
            mutation.mutate(values, { onSuccess: () => onSuccess?.() }),
          )}
          className="flex flex-col gap-4"
          noValidate
        >
          <FormTextField
            control={form.control}
            name="code"
            label={t("twoFactor.codeLabel")}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder={t("twoFactor.codePlaceholder")}
          />
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? t("twoFactor.verifying") : t("twoFactor.enableAction")}
          </Button>
        </form>
      </Form>
    </div>
  );
}
