import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { type ResetPasswordInput, resetPasswordSchema } from "../../../shared/auth/auth.schema";
import { useResetPassword } from "../hooks/use-reset-password";

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const { t } = useTranslation("auth");
  const mutation = useResetPassword(token);

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
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
          name="password"
          label={t("resetPassword.newPasswordLabel")}
          type="password"
          autoComplete="new-password"
          placeholder={t("signIn.passwordPlaceholder")}
          description={t("passwordField.hint")}
        />

        <FormTextField
          control={form.control}
          name="confirmPassword"
          label={t("resetPassword.confirmPasswordLabel")}
          type="password"
          autoComplete="new-password"
          placeholder={t("signIn.passwordPlaceholder")}
        />

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? t("resetPassword.submitPending") : t("resetPassword.submit")}
        </Button>
      </form>
    </Form>
  );
}
