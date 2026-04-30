import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import type { UseMutationResult } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { emailSchema } from "../../../adapters/schemas/auth.schema";

const emailRequestSchema = z.object({ email: emailSchema });
type EmailRequestInput = z.infer<typeof emailRequestSchema>;

interface EmailRequestFormProps {
  mutation: UseMutationResult<unknown, Error, { email: string }>;
  submitLabel: string;
  pendingLabel: string;
  buttonVariant?: "default" | "outline";
}

export function EmailRequestForm({
  mutation,
  submitLabel,
  pendingLabel,
  buttonVariant = "default",
}: EmailRequestFormProps) {
  const form = useForm<EmailRequestInput>({
    resolver: zodResolver(emailRequestSchema),
    defaultValues: { email: "" },
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
          autoComplete="email"
          placeholder="you@example.com"
        />
        <Button
          type="submit"
          variant={buttonVariant}
          className="w-full"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? pendingLabel : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
