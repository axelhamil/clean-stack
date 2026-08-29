import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormCheckboxField } from "@packages/ui/components/ui/form-checkbox-field";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { KeyRoundIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { type SignInInput, signInSchema } from "../../../shared/auth/auth.schema";
import { usePasskeyAutofill } from "../hooks/use-passkey-autofill";
import { usePasskeySupported } from "../hooks/use-passkey-supported";
import { useSignIn } from "../hooks/use-sign-in";
import { useSignInPasskey } from "../hooks/use-sign-in-passkey";

interface SignInFormProps {
  redirectTo?: string;
}

export function SignInForm({ redirectTo }: SignInFormProps = {}) {
  const { t } = useTranslation("auth");
  const mutation = useSignIn(redirectTo);
  const passkey = useSignInPasskey(redirectTo);
  const support = usePasskeySupported();
  const autofill = usePasskeyAutofill({ enabled: support.conditional, redirectTo });

  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "", rememberMe: true },
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
          name="email"
          label={t("emailField.label")}
          type="email"
          autoComplete={support.conditional ? "username webauthn" : "username"}
          placeholder={t("emailField.placeholder")}
        />

        <FormTextField
          control={form.control}
          name="password"
          label={t("signIn.passwordLabel")}
          type="password"
          autoComplete="current-password"
          placeholder={t("signIn.passwordPlaceholder")}
        />

        <FormCheckboxField
          control={form.control}
          name="rememberMe"
          label={t("signIn.rememberMe")}
        />
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? t("signIn.pending") : t("signIn.submit")}
        </Button>

        {support.available && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              autofill.abort();
              passkey.mutate();
            }}
            disabled={passkey.isPending}
          >
            <KeyRoundIcon />
            {passkey.isPending ? t("signIn.passkeyWaiting") : t("signIn.passkeyButton")}
          </Button>
        )}
      </form>
    </Form>
  );
}
