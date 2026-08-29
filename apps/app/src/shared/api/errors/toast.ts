import { toast } from "sonner";
import { getErrorsT } from "../../i18n/get-errors-t";
import type { ApiError } from "./api-error";
import { formatApiError } from "./messages";

function rawMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }
  return undefined;
}

export function toastError(err: unknown, fallback: string): void {
  if ((err as ApiError)?.status === 429) return;
  toast.error(formatApiError(err, rawMessage(err) ?? fallback, getErrorsT()));
}

export function toastSuccess(message: string): void {
  toast.success(message);
}
