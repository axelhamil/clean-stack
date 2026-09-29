import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormCheckboxField } from "@packages/ui/components/ui/form-checkbox-field";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
import { Trans, useTranslation } from "react-i18next";
import { type SignUpInput, signUpSchema } from "../../../shared/auth/auth.schema";
import { PolicyLink } from "../../../shared/components/policy-link";
import { usePasswordRevealLabels } from "../../../shared/i18n/use-password-reveal-labels";
import { useSignUp } from "../hooks/use-sign-up";

export function SignUpForm() {
  const { t } = useTranslation("auth");
  const revealLabels = usePasswordRevealLabels();
  const mutation = useSignUp();

  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "", acceptedPolicies: false },
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
          name="name"
          label={t("signUp.nameLabel")}
          autoComplete="name"
          placeholder={t("signUp.namePlaceholder")}
        />

        <FormTextField
          control={form.control}
          name="email"
          label={t("emailField.label")}
          type="email"
          autoComplete="email"
          placeholder={t("emailField.placeholder")}
        />

        <FormTextField
          control={form.control}
          name="password"
          label={t("signIn.passwordLabel")}
          type="password"
          {...revealLabels}
          autoComplete="new-password"
          placeholder={t("signIn.passwordPlaceholder")}
          description={t("passwordField.hint")}
        />

        <FormCheckboxField
          control={form.control}
          name="acceptedPolicies"
          label={
            <Trans
              ns="auth"
              i18nKey="signUp.accept"
              components={{
                privacy: <PolicyLink type="privacy" />,
                terms: <PolicyLink type="terms" />,
              }}
            />
          }
        />

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? t("signUp.pending") : t("signUp.submit")}
        </Button>
      </form>
    </Form>
  );
}
