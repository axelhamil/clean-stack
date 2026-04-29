import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
import { useAddPasskey } from "../_hooks/use-add-passkey";
import {
  type AddPasskeyInput,
  addPasskeySchema,
} from "../_schemas/account.schema";

interface AddPasskeyFormProps {
  onSuccess?: () => void;
}

export function AddPasskeyForm({ onSuccess }: AddPasskeyFormProps = {}) {
  const mutation = useAddPasskey();

  const form = useForm<AddPasskeyInput>({
    resolver: zodResolver(addPasskeySchema),
    defaultValues: { name: "" },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) =>
          mutation.mutate(values, { onSuccess: () => onSuccess?.() }),
        )}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormTextField
          control={form.control}
          name="name"
          label="Name"
          placeholder="MacBook Touch ID"
          autoComplete="off"
        />
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? "Waiting for device…" : "Add passkey"}
        </Button>
      </form>
    </Form>
  );
}
