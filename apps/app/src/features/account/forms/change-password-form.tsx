import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
import { type ChangePasswordInput, changePasswordSchema } from "../account.schema";
import { useChangePassword } from "../hooks/use-change-password";

interface ChangePasswordFormProps {
  onSuccess?: () => void;
}

export function ChangePasswordForm({ onSuccess }: ChangePasswordFormProps = {}) {
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
          label="Current password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
        />
        <FormTextField
          control={form.control}
          name="newPassword"
          label="New password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          description="At least 15 characters. Avoid passwords exposed in known data breaches."
        />
        <FormTextField
          control={form.control}
          name="confirmPassword"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
        />
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Change password"}
        </Button>
      </form>
    </Form>
  );
}
