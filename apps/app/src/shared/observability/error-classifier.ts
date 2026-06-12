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

const FLOW_CONTROL_MESSAGES = new Set(["Cancelled", "email-not-verified-redirect"]);

export function isUnexpectedMutationError(error: unknown): boolean {
  if (!isUnexpectedError(error)) return false;
  if (error instanceof Error && FLOW_CONTROL_MESSAGES.has(error.message)) return false;
  return true;
}
