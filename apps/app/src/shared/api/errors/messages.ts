/**
 * User-facing error message registry.
 *
 * Two layers — exact-code overrides win, suffix defaults catch the rest.
 * Suffix defaults align with ddd-kit's STATUS_BY_SUFFIX, so any new error
 * code coming from the backend automatically lands on a sensible default
 * (e.g. a freshly-added `*_RATE_LIMITED` code displays the rate-limit copy
 * without any frontend edit). Promote a code to OVERRIDES the moment its
 * default copy is wrong for the UX context.
 *
 * Reach for `formatApiError(err, fallback)` from any onError handler;
 * the per-call fallback covers genuinely unknown errors and network failures.
 */

import type { ApiError } from "./api-error";

const OVERRIDES: Record<string, string> = {
  ACCOUNT_EXPORT_RATE_LIMITED: "You can request another data export in 24 hours.",
  ACCOUNT_PASSWORD_REQUIRED: "Confirm with your password.",
  ACCOUNT_DELETION_BLOCKED: "Resolve organization ownership before deleting your account.",
  ACCOUNT_DELETION_NOT_FOUND: "No deletion to cancel.",
  ACCOUNT_PASSWORD_INVALID: "Invalid password.",
  TWO_FACTOR_REQUIRED: "Confirm with your password or authenticator code.",
  TWO_FACTOR_INVALID: "Invalid authenticator code.",
};

const SUFFIX_DEFAULTS: readonly [suffix: string, message: string][] = [
  ["_RATE_LIMITED", "Too many requests. Please wait a moment and try again."],
  ["_NOT_FOUND", "Not found."],
  ["_FORBIDDEN", "You don't have permission to do this."],
  ["_UNAUTHORIZED", "Please sign in again."],
  ["_REQUIRED", "Additional confirmation required."],
  ["_BLOCKED", "Action blocked."],
  ["_INVALID", "Invalid input."],
  ["_INTEGRITY_FAILED", "Data integrity check failed. Please try again."],
  ["_PROVIDER_FAILURE", "Service is temporarily unavailable. Please try again."],
  ["_UNAVAILABLE", "Service is temporarily unavailable. Please try again."],
  ["_TIMEOUT", "Request timed out. Please try again."],
];

function messageFromCode(code: string): string | undefined {
  if (OVERRIDES[code]) return OVERRIDES[code];
  for (const [suffix, message] of SUFFIX_DEFAULTS) {
    if (code.endsWith(suffix)) return message;
  }
  return undefined;
}

export function formatApiError(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null) {
    const code = (err as ApiError).code;
    if (code) {
      const message = messageFromCode(code);
      if (message) return message;
    }
  }
  return fallback;
}
