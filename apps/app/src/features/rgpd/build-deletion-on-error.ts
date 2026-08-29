import type { TFunction } from "i18next";
import { toast } from "sonner";
import type { ApiError } from "../../shared/api/errors/api-error";
import { formatApiError } from "../../shared/api/errors/messages";

type FieldErrorReporter = (message: string) => void;

function errorCode(err: unknown): string | undefined {
  if (typeof err === "object" && err !== null) return (err as ApiError).code;
  return undefined;
}

export function buildDeletionOnError(
  onClose: () => void,
  fieldErrorCode: string,
  reportFieldError: FieldErrorReporter,
  t: TFunction<"errors">,
  tSettings: TFunction<"settings">,
) {
  return (err: unknown) => {
    const code = errorCode(err);
    const fallback = tSettings("deletion.requestFailed");
    if (code === "ACCOUNT_DELETION_BLOCKED") {
      toast.error(formatApiError(err, fallback, t));
      onClose();
      return;
    }
    if (code === fieldErrorCode) {
      reportFieldError(tSettings("deletion.invalidCredential"));
      return;
    }
    toast.error(formatApiError(err, fallback, t));
  };
}
