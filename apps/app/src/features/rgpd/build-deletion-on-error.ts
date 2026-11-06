import { apiErrorFields } from "@packages/web-kit/api/errors/api-error";
import { formatApiError } from "@packages/web-kit/api/errors/messages";
import type { TFunction } from "i18next";
import { toast } from "sonner";

type FieldErrorReporter = (message: string) => void;

export function buildDeletionOnError(
  onClose: () => void,
  fieldErrorCode: string,
  reportFieldError: FieldErrorReporter,
  tErrors: TFunction<"errors">,
  t: TFunction<"settings">,
) {
  return (err: unknown) => {
    const { code } = apiErrorFields(err);
    if (code === fieldErrorCode) {
      reportFieldError(t("deletion.invalidCredential"));
      return;
    }

    toast.error(formatApiError(err, t("deletion.requestFailed"), tErrors));

    // A blocked deletion cannot be fixed from inside the dialog, so it closes
    // and the toast says why.
    if (code === "ACCOUNT_DELETION_BLOCKED" || code === "ACCOUNT_DELETION_LAST_MANAGER_FORBIDDEN") {
      onClose();
    }
  };
}
