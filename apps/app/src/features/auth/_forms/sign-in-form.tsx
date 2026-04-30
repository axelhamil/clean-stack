import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Checkbox } from "@packages/ui/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { KeyRoundIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { type SignInInput, signInSchema } from "../../../adapters/schemas/auth.schema";
import { usePasskeyAutofill } from "../_hooks/use-passkey-autofill";
import { usePasskeySupported } from "../_hooks/use-passkey-supported";
import { useSignIn } from "../_hooks/use-sign-in";
import { useSignInPasskey } from "../_hooks/use-sign-in-passkey";

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

        <FormField
          control={form.control}
          name="rememberMe"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel weight="normal">Remember me</FormLabel>
            </FormItem>
          )}
        />
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
