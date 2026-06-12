import { CancelledError } from "@tanstack/react-query";
import type { ApiError } from "../api/errors/api-error";

export function isUnexpectedError(error: unknown): boolean {
  if (error instanceof CancelledError) return false;
  if (error instanceof Error && error.name === "AbortError") return false;
  if (typeof error !== "object" || error === null) return true;
  const { status } = error as ApiError;
  if (typeof status === "number") return status >= 500;
  return true;
}
