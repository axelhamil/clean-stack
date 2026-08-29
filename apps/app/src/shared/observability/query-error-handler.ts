import type { Mutation, Query } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import type { ApiError } from "../api/errors/api-error";
import { rateLimitedMessage } from "../api/errors/messages";
import { getErrorsT } from "../i18n/get-errors-t";
import { isUnexpectedError, isUnexpectedMutationError } from "./error-classifier";
import { captureError } from "./sentry";

function errorContext(error: unknown): { status?: number; code?: string } {
  if (typeof error !== "object" || error === null) return {};
  const { status, code } = error as ApiError;
  return { status, code };
}

/**
 * The unit is part of the sentence, not a token appended to it: French and
 * English disagree on plural thresholds and on where the number sits, so a
 * `${count} ${unit}` template cannot be translated correctly whatever the
 * unit words are.
 */
function retryAfterMessage(seconds: number, t: TFunction<"errors">): string {
  if (seconds < 60) return t("rateLimit.retryInSeconds", { count: seconds });
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return t("rateLimit.retryInMinutes", { count: minutes });
  return t("rateLimit.retryInHours", { count: Math.ceil(minutes / 60) });
}

function notifyIfRateLimited(error: unknown): boolean {
  if (errorContext(error).status !== 429) return false;
  const retryAfter = (error as ApiError).metadata?.retryAfter;
  const t = getErrorsT();
  toast.error(rateLimitedMessage(t), {
    id: "rate-limit",
    description: typeof retryAfter === "number" ? retryAfterMessage(retryAfter, t) : undefined,
  });
  return true;
}

export function onQueryError(error: unknown, query: Query<unknown, unknown>): void {
  if (notifyIfRateLimited(error)) return;
  if (!isUnexpectedError(error)) return;
  captureError(error, { queryKey: query.queryKey, ...errorContext(error) });
}

export function onMutationError(
  error: unknown,
  _variables: unknown,
  _onMutateResult: unknown,
  mutation: Mutation<unknown, unknown>,
): void {
  if (notifyIfRateLimited(error)) return;
  if (!isUnexpectedMutationError(error)) return;
  captureError(error, {
    mutationKey: mutation.options.mutationKey ?? null,
    ...errorContext(error),
  });
}
