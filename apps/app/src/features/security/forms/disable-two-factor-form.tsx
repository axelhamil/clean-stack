import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useDisableTwoFactor } from "../hooks/use-disable-two-factor";
import { type PasswordPromptInput, passwordPromptSchema } from "../security.schema";

interface DisableTwoFactorFormProps {
  onSuccess?: () => void;
}

export function DisableTwoFactorForm({ onSuccess }: DisableTwoFactorFormProps = {}) {
  const { t } = useTranslation("settings");
  const mutation = useDisableTwoFactor();
  const form = useForm<PasswordPromptInput>({
    resolver: zodResolver(passwordPromptSchema),
    defaultValues: { password: "" },
  });

  return (
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
          name="password"
          label={t("twoFactor.passwordLabel")}
          type="password"
          autoComplete="current-password"
          placeholder={t("twoFactor.passwordPlaceholder")}
        />
        <Button
          type="submit"
          variant="destructive"
          className="w-full"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? t("twoFactor.disabling") : t("twoFactor.disableAction")}
        </Button>
      </form>
    </Form>
  );
}
