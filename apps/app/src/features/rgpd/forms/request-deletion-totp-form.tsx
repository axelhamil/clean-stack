import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@packages/ui/components/ui/alert-dialog";
import { Form } from "@packages/ui/components/ui/form";
import { FormTextField } from "@packages/ui/components/ui/form-text-field";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { ImpersonationReason } from "../../../shared/auth/impersonation-reason";
import { useImpersonationGuard } from "../../../shared/auth/use-impersonation-guard";
import { buildDeletionOnError } from "../build-deletion-on-error";
import { useRequestDeletion } from "../hooks/use-request-deletion";
import { type RequestDeletionWithTotpInput, requestDeletionWithTotpSchema } from "../rgpd.schema";

interface RequestDeletionTotpFormProps {
  onClose: () => void;
}

export function RequestDeletionTotpForm({ onClose }: RequestDeletionTotpFormProps) {
  const { t } = useTranslation("errors");
  const { t: tSettings } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const mutation = useRequestDeletion({ onClose });
  const guard = useImpersonationGuard();
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
              t,
              tSettings,
            ),
          }),
        )}
        className="flex flex-col gap-4"
        noValidate
      >
        <FormTextField
          control={form.control}
          name="totpCode"
          label={tSettings("deletion.totpLabel")}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder={tSettings("deletion.totpPlaceholder")}
        />
        <AlertDialogFooter>
          <AlertDialogCancel type="button">{tCommon("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            type="submit"
            variant="destructive"
            disabled={mutation.isPending || guard.blocked}
            {...guard.describeProps(mutation.isPending)}
          >
            {mutation.isPending ? tSettings("deletion.submitting") : tSettings("deletion.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
        <ImpersonationReason guard={guard} />
      </form>
    </Form>
  );
}
