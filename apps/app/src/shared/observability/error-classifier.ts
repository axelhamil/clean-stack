import { CancelledError } from "@tanstack/react-query";
import { apiErrorFields } from "../api/errors/api-error";

export function isUnexpectedError(error: unknown): boolean {
  if (error instanceof CancelledError) return false;
  if (error instanceof Error && error.name === "AbortError") return false;

  const { status } = apiErrorFields(error);
  return typeof status !== "number" || status >= 500;
}

const FLOW_CONTROL_MESSAGES = new Set(["Cancelled", "email-not-verified-redirect"]);

export function isUnexpectedMutationError(error: unknown): boolean {
  if (!isUnexpectedError(error)) return false;
  return !(error instanceof Error && FLOW_CONTROL_MESSAGES.has(error.message));
}
