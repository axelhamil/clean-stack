import { CancelledError } from "@tanstack/react-query";
import { apiErrorFields } from "../api/errors/api-error";

export function isUnexpectedError(error: unknown): boolean {
  if (error instanceof CancelledError) return false;
  if (error instanceof Error && error.name === "AbortError") return false;

  const { status } = apiErrorFields(error);
  return typeof status !== "number" || status >= 500;
}

/**
 * Messages a mutation throws on purpose to stop its own flow (a closed passkey
 * prompt, a redirect already under way). The hooks throw these exact constants so
 * the allowlist below cannot drift from what they throw.
 */
export const PASSKEY_CANCELLED = "Cancelled";
export const EMAIL_NOT_VERIFIED_REDIRECT = "email-not-verified-redirect";
export const SSO_REDIRECT_IN_PROGRESS = "sso-redirect-in-progress";

const FLOW_CONTROL_MESSAGES = new Set<string>([
  PASSKEY_CANCELLED,
  EMAIL_NOT_VERIFIED_REDIRECT,
  SSO_REDIRECT_IN_PROGRESS,
]);

export function isUnexpectedMutationError(error: unknown): boolean {
  if (!isUnexpectedError(error)) return false;
  return !(error instanceof Error && FLOW_CONTROL_MESSAGES.has(error.message));
}
