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
import {
  type RequestDeletionWithPasswordInput,
  requestDeletionWithPasswordSchema,
} from "../rgpd.schema";

interface RequestDeletionPasswordFormProps {
  onClose: () => void;
}

export function RequestDeletionPasswordForm({ onClose }: RequestDeletionPasswordFormProps) {
  const { t } = useTranslation("errors");
  const { t: tSettings } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const mutation = useRequestDeletion({ onClose });
  const guard = useImpersonationGuard();
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
          name="password"
          label={tSettings("deletion.passwordLabel")}
          type="password"
          autoComplete="current-password"
          placeholder={tSettings("deletion.passwordPlaceholder")}
        />
        <AlertDialogFooter>
          <AlertDialogCancel type="button">{tCommon("actions.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            type="submit"
            variant="destructive"
            disabled={mutation.isPending || guard.blocked}
            title={guard.reason}
            aria-describedby={guard.blocked ? guard.descriptionId : undefined}
          >
            {mutation.isPending ? tSettings("deletion.submitting") : tSettings("deletion.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
        <ImpersonationReason guard={guard} />
      </form>
    </Form>
  );
}
