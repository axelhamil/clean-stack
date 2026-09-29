import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { buildDeletionOnError } from "../build-deletion-on-error";
import { DeletionConfirmFooter } from "../components/deletion-confirm-footer";
import { useRequestDeletion } from "../hooks/use-request-deletion";
import {
  type RequestDeletionWithPasswordInput,
  requestDeletionWithPasswordSchema,
} from "../rgpd.schema";

interface RequestDeletionPasswordFormProps {
  onClose: () => void;
}

export function RequestDeletionPasswordForm({ onClose }: RequestDeletionPasswordFormProps) {
  const { t } = useTranslation("settings");
  const { t: tErrors } = useTranslation("errors");
  const mutation = useRequestDeletion({ onClose });
  const form = useForm<RequestDeletionWithPasswordInput>({
    resolver: zodResolver(requestDeletionWithPasswordSchema),
    defaultValues: { password: "" },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) =>
          mutation.mutate(values, {
            onError: buildDeletionOnError(
              onClose,
              "ACCOUNT_PASSWORD_INVALID",
              (msg) => form.setError("password", { message: msg }),
              tErrors,
              t,
            ),
          }),
        )}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormTextField
          control={form.control}
          name="password"
          label={t("deletion.passwordLabel")}
          type="password"
          autoComplete="current-password"
          placeholder={t("deletion.passwordPlaceholder")}
        />
        <DeletionConfirmFooter isPending={mutation.isPending} />
      </form>
    </Form>
  );
}
