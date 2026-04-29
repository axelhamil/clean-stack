import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { CopyIcon } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { type EnableTwoFactorResult, useEnableTwoFactor } from "../_hooks/use-enable-two-factor";
import { useVerifyTwoFactorSetup } from "../_hooks/use-verify-two-factor-setup";
import {
  type PasswordPromptInput,
  passwordPromptSchema,
  type VerifyTotpSetupInput,
  verifyTotpSetupSchema,
} from "../_schemas/account.schema";

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
        <TypographyMuted>
          Confirm your password to set up two-factor authentication.
        </TypographyMuted>
        <FormTextField
          control={form.control}
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
        />
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? "Generating…" : "Continue"}
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
  const mutation = useVerifyTwoFactorSetup();
  const form = useForm<VerifyTotpSetupInput>({
    resolver: zodResolver(verifyTotpSetupSchema),
    defaultValues: { code: "" },
  });

  const copyBackupCodes = () => {
    void navigator.clipboard.writeText(setup.backupCodes.join("\n"));
    toast.success("Backup codes copied");
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3">
        <QRCodeSVG
          value={setup.totpURI}
          size={176}
          marginSize={4}
          bgColor="#ffffff"
          fgColor="#000000"
        />
        <TypographyMuted className="text-center">
          Scan with your authenticator app, then enter the 6-digit code below.
        </TypographyMuted>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1.5">
              <CardTitle>Backup codes</CardTitle>
              <CardDescription>
                Save these in a safe place. Each can be used once if you lose your device.
              </CardDescription>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={copyBackupCodes}>
              <CopyIcon />
              Copy
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-2 gap-1 font-mono text-xs">
            {setup.backupCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

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
            label="Verification code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
          />
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Verifying…" : "Enable two-factor"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
