import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormCheckboxField } from "@packages/ui/components/ui/form-checkbox-field";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { KeyRoundIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { type SignInInput, signInSchema } from "../../../shared/auth/auth.schema";
import { usePasskeyAutofill } from "../hooks/use-passkey-autofill";
import { usePasskeySupported } from "../hooks/use-passkey-supported";
import { useSignIn } from "../hooks/use-sign-in";
import { useSignInPasskey } from "../hooks/use-sign-in-passkey";

interface SignInFormProps {
  redirectTo?: string;
}

export function SignInForm({ redirectTo }: SignInFormProps = {}) {
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
          label="Email"
          type="email"
          autoComplete={support.conditional ? "username webauthn" : "username"}
          placeholder="you@example.com"
        />

        <FormTextField
          control={form.control}
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
        />

        <FormCheckboxField control={form.control} name="rememberMe" label="Remember me" />
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? "Signing in…" : "Sign in"}
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
            {passkey.isPending ? "Waiting for device…" : "Sign in with passkey"}
          </Button>
        )}
      </form>
    </Form>
  );
}
