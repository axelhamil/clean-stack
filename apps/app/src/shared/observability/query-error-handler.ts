import type { Mutation, Query } from "@tanstack/react-query";
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

function formatRetryAfter(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.ceil(minutes / 60)} h`;
}

function notifyIfRateLimited(error: unknown): boolean {
  if (errorContext(error).status !== 429) return false;
  const retryAfter = (error as ApiError).metadata?.retryAfter;
  toast.error(rateLimitedMessage(getErrorsT()), {
    id: "rate-limit",
    description:
      typeof retryAfter === "number" ? `Try again in ${formatRetryAfter(retryAfter)}.` : undefined,
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
