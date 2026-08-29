import { toast } from "sonner";
import { getErrorsT } from "../../i18n/get-errors-t";
import type { ApiError } from "./api-error";
import { formatApiError } from "./messages";

/**
 * Surfaces an error as a toast, resolving its copy the same way
 * `resolveAuthError` does: the error code is looked up in the `errors`
 * catalog, and the caller's own localised fallback covers the rest. The raw
 * server `message` is deliberately not used — it is untranslated English
 * written for developers, and preferring it over the fallback is what would
 * make one half of the app speak English while the other speaks the user's
 * language.
 */
export function toastError(err: unknown, fallback: string): void {
  if ((err as ApiError)?.status === 429) return;
  toast.error(formatApiError(err, fallback, getErrorsT()));
}

export function toastSuccess(message: string): void {
  toast.success(message);
}
