import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { type ChangePasswordInput, changePasswordSchema } from "../account.schema";
import { useChangePassword } from "../hooks/use-change-password";

interface ChangePasswordFormProps {
  onSuccess?: () => void;
}

export function ChangePasswordForm({ onSuccess }: ChangePasswordFormProps = {}) {
  const { t } = useTranslation(["settings", "auth"]);
  const mutation = useChangePassword();
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) =>
          mutation.mutate(values, {
            onSuccess: () => {
              form.reset();
              onSuccess?.();
            },
            onError: (error) => {
              const field = /incorrect|current/i.test(error.message)
                ? "currentPassword"
                : "newPassword";
              form.setError(field, { message: error.message });
            },
          }),
        )}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormTextField
          control={form.control}
          name="currentPassword"
          label={t("account.currentPasswordLabel")}
          type="password"
          autoComplete="current-password"
          placeholder={t("auth:signIn.passwordPlaceholder")}
        />
        <FormTextField
          control={form.control}
          name="newPassword"
          label={t("account.newPasswordLabel")}
          type="password"
          autoComplete="new-password"
          placeholder={t("auth:signIn.passwordPlaceholder")}
          description={t("auth:passwordField.hint")}
        />
        <FormTextField
          control={form.control}
          name="confirmPassword"
          label={t("account.confirmNewPasswordLabel")}
          type="password"
          autoComplete="new-password"
          placeholder={t("auth:signIn.passwordPlaceholder")}
        />
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? t("account.saving") : t("account.changePasswordButton")}
        </Button>
      </form>
    </Form>
  );
}
