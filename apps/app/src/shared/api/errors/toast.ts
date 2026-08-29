import { toast } from "sonner";
import { getErrorsT } from "../../i18n/get-errors-t";
import type { ApiError } from "./api-error";
import { formatApiError } from "./messages";

/**
 * Surfaces an error as a toast, resolving its copy the same way
 * `resolveAuthError` does: the error code is looked up in the `errors`
 * catalog first, and the caller's own localised fallback covers a network
 * failure or a 5xx. In between, a 4xx the catalog has no entry for falls
 * back to the raw server `message` as a last resort (`formatApiError` /
 * `serverMessage`) — it is untranslated English written for developers, but
 * it is still a rejection the user could act on, so showing it beats the
 * generic fallback both for the user and for keeping the gap visible instead
 * of silently swallowed into copy that says nothing.
 */
export function toastError(err: unknown, fallback: string): void {
  if ((err as ApiError)?.status === 429) return;
  toast.error(formatApiError(err, fallback, getErrorsT()));
}

export function toastSuccess(message: string): void {
  toast.success(message);
}
