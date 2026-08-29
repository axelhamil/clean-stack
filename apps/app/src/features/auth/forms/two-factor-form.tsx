import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormCheckboxField } from "@packages/ui/components/ui/form-checkbox-field";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { type TwoFactorInput, twoFactorSchema } from "../../../shared/auth/auth.schema";
import { useVerifyTwoFactor } from "../hooks/use-verify-two-factor";

interface TwoFactorFormProps {
  redirectTo?: string;
}

export function TwoFactorForm({ redirectTo }: TwoFactorFormProps = {}) {
  const { t } = useTranslation("auth");
  const mutation = useVerifyTwoFactor(redirectTo);
  const form = useForm<TwoFactorInput>({
    resolver: zodResolver(twoFactorSchema),
    defaultValues: { code: "", trustDevice: false },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
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

        <FormCheckboxField
          control={form.control}
          name="trustDevice"
          label={t("twoFactor.trustDevice")}
        />

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? t("twoFactor.verifyPending") : t("twoFactor.verify")}
        </Button>
      </form>
    </Form>
  );
}
