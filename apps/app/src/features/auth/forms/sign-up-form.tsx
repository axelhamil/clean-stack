import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Checkbox } from "@packages/ui/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
import { Trans, useTranslation } from "react-i18next";
import { type SignUpInput, signUpSchema } from "../../../shared/auth/auth.schema";
import { PolicyLink } from "../../../shared/components/policy-link";
import { useSignUp } from "../hooks/use-sign-up";

export function SignUpForm() {
  const { t } = useTranslation("auth");
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
          autoComplete="new-password"
          placeholder={t("signIn.passwordPlaceholder")}
          description={t("passwordField.hint")}
        />

        <FormField
          control={form.control}
          name="acceptedPolicies"
          render={({ field }) => (
            <FormItem className="flex flex-col gap-1">
              <div className="flex flex-row items-center gap-2">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel weight="normal" className="block leading-normal">
                  <Trans
                    ns="auth"
                    i18nKey="signUp.accept"
                    components={{
                      privacy: <PolicyLink type="privacy" />,
                      terms: <PolicyLink type="terms" />,
                    }}
                  />
                </FormLabel>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? t("signUp.pending") : t("signUp.submit")}
        </Button>
      </form>
    </Form>
  );
}
