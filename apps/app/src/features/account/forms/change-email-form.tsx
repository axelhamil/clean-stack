import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
import { type ChangeEmailInput, changeEmailSchema } from "../account.schema";
import { useChangeEmail } from "../hooks/use-change-email";

interface ChangeEmailFormProps {
  onSuccess?: () => void;
}

export function ChangeEmailForm({ onSuccess }: ChangeEmailFormProps = {}) {
  const mutation = useChangeEmail();
  const form = useForm<ChangeEmailInput>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { newEmail: "" },
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
          }),
        )}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormTextField
          control={form.control}
          name="newEmail"
          label="New email address"
          type="email"
          autoComplete="email"
        />
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? "Sending…" : "Send confirmation"}
        </Button>
      </form>
    </Form>
  );
}
