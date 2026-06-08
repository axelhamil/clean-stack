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
import { type SignUpInput, signUpSchema } from "../../../shared/auth/auth.schema";
import { PolicyLink } from "../../../shared/components/policy-link";
import { useSignUp } from "../hooks/use-sign-up";

export function SignUpForm() {
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
          label="Name"
          autoComplete="name"
          placeholder="Ada Lovelace"
        />

        <FormTextField
          control={form.control}
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
        />

        <FormTextField
          control={form.control}
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          description="At least 15 characters. Avoid passwords exposed in known data breaches."
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
                <FormLabel weight="normal">
                  I accept the <PolicyLink type="privacy">Privacy Policy</PolicyLink> and{" "}
                  <PolicyLink type="terms">Terms of Service</PolicyLink>
                </FormLabel>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </Form>
  );
}
