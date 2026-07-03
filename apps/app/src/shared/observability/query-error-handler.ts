import type { Mutation, Query } from "@tanstack/react-query";
import type { ApiError } from "../api/errors/api-error";
import { isUnexpectedError, isUnexpectedMutationError } from "./error-classifier";
import { captureError } from "./sentry";

function errorContext(error: unknown): { status?: number; code?: string } {
  if (typeof error !== "object" || error === null) return {};
  const { status, code } = error as ApiError;
  return { status, code };
}

export function onQueryError(error: unknown, query: Query<unknown, unknown>): void {
  if (!isUnexpectedError(error)) return;
  captureError(error, { queryKey: query.queryKey, ...errorContext(error) });
}

export function onMutationError(
  error: unknown,
  _variables: unknown,
  _onMutateResult: unknown,
  mutation: Mutation<unknown, unknown>,
): void {
  if (!isUnexpectedMutationError(error)) return;
  captureError(error, {
    mutationKey: mutation.options.mutationKey ?? null,
    ...errorContext(error),
  });
}
