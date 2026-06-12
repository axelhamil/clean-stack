import { toast } from "sonner";
import type { ApiError } from "./api-error";
import { formatApiError, RATE_LIMITED_MESSAGE } from "./messages";
import { showRateLimitToast } from "./rate-limit-toast";

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
  const apiErr = err as ApiError;
  if (apiErr?.status === 429) {
    const retryAfter = apiErr.metadata?.retryAfter;
    if (typeof retryAfter === "number") {
      showRateLimitToast({
        message: RATE_LIMITED_MESSAGE,
        seconds: retryAfter,
      });
      return;
    }
  }
  toast.error(formatApiError(err, rawMessage(err) ?? fallback));
}

export function toastSuccess(message: string): void {
  toast.success(message);
}
