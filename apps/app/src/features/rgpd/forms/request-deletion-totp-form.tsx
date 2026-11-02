import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { buildDeletionOnError } from "../build-deletion-on-error";
import { DeletionConfirmFooter } from "../components/deletion-confirm-footer";
import { useRequestDeletion } from "../hooks/use-request-deletion";
import { type RequestDeletionWithTotpInput, requestDeletionWithTotpSchema } from "../rgpd.schema";

interface RequestDeletionTotpFormProps {
  onClose: () => void;
}

export function RequestDeletionTotpForm({ onClose }: RequestDeletionTotpFormProps) {
  const { t } = useTranslation("settings");
  const { t: tErrors } = useTranslation("errors");
  const mutation = useRequestDeletion({ onClose });
  const form = useForm<RequestDeletionWithTotpInput>({
    resolver: zodResolver(requestDeletionWithTotpSchema),
    defaultValues: { totpCode: "" },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) =>
          mutation.mutate(values, {
            onError: buildDeletionOnError(
              onClose,
              "TWO_FACTOR_INVALID",
              (msg) => form.setError("totpCode", { message: msg }),
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
          name="totpCode"
          label={t("deletion.totpLabel")}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder={t("deletion.totpPlaceholder")}
        />
        <DeletionConfirmFooter isPending={mutation.isPending} />
      </form>
    </Form>
  );
}
