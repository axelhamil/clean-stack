import { toast } from "sonner";
import { formatApiError } from "../../../shared/api/errors/messages";

type FieldErrorReporter = (message: string) => void;

export function buildDeletionOnError(
  onClose: () => void,
  fieldErrorCode: string,
  reportFieldError: FieldErrorReporter,
) {
  return (err: unknown) => {
    const e = err as { code?: string };
    if (e.code === "ACCOUNT_DELETION_BLOCKED") {
      toast.error(formatApiError(err, "Couldn't request deletion. Please try again."));
      onClose();
      return;
    }
    if (e.code === fieldErrorCode) {
      reportFieldError("Invalid credential");
      return;
    }
    toast.error(formatApiError(err, "Couldn't request deletion. Please try again."));
  };
}
