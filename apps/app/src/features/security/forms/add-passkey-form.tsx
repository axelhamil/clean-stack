import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@packages/ui/components/ui/button";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useAddPasskey } from "../hooks/use-add-passkey";
import { type AddPasskeyInput, addPasskeySchema } from "../security.schema";

interface AddPasskeyFormProps {
  onSuccess?: () => void;
}

export function AddPasskeyForm({ onSuccess }: AddPasskeyFormProps = {}) {
  const { t } = useTranslation("settings");
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
          label={t("passkeys.nameLabel")}
          placeholder={t("passkeys.namePlaceholder")}
          autoComplete="off"
        />
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? t("passkeys.waitingForDevice") : t("passkeys.add")}
        </Button>
      </form>
    </Form>
  );
}
