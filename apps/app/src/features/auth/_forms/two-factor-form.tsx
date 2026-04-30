import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Checkbox } from "@packages/ui/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
import { type TwoFactorInput, twoFactorSchema } from "../../../adapters/schemas/auth.schema";
import { useVerifyTwoFactor } from "../_hooks/use-verify-two-factor";

interface TwoFactorFormProps {
  redirectTo?: string;
}

export function TwoFactorForm({ redirectTo }: TwoFactorFormProps = {}) {
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
          label="Authentication code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
        />

        <FormField
          control={form.control}
          name="trustDevice"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel weight="normal">Trust this device</FormLabel>
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? "Verifying…" : "Verify"}
        </Button>
      </form>
    </Form>
  );
}
