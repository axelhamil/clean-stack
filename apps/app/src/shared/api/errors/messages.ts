/**
 * User-facing error message registry.
 *
 * Two layers — exact-code overrides win, suffix defaults catch the rest —
 * both sourced from the `errors` i18next namespace (`byCode`/`bySuffix`)
 * rather than hardcoded literals, so the copy translates with the rest of
 * the app. Suffix defaults align with ddd-kit's STATUS_BY_SUFFIX, so any new
 * error code coming from the backend automatically lands on a sensible
 * default (e.g. a freshly-added `*_RATE_LIMITED` code displays the
 * rate-limit copy without any frontend edit). Promote a code to `byCode` the
 * moment its default copy is wrong for the UX context.
 *
 * Reach for `formatApiError(err, fallback, t)` from any onError handler;
 * the per-call fallback covers genuinely unknown errors and network failures.
 */

import type { TFunction } from "i18next";
import type { ApiError } from "./api-error";

const SUFFIXES = [
  "RATE_LIMITED",
  "INTEGRITY_FAILED",
  "PROVIDER_FAILURE",
  "NOT_FOUND",
  "FORBIDDEN",
  "UNAUTHORIZED",
  "REQUIRED",
  "BLOCKED",
  "INVALID",
  "UNAVAILABLE",
  "TIMEOUT",
] as const;

export function rateLimitedMessage(t: TFunction<"errors">): string {
  return t("bySuffix.RATE_LIMITED");
}

function messageFromCode(code: string, t: TFunction<"errors">): string | undefined {
  const exact = t(`byCode.${code}` as never, { defaultValue: "" });
  if (exact) return exact;
  for (const suffix of SUFFIXES) {
    if (code.endsWith(`_${suffix}`)) return t(`bySuffix.${suffix}` as never);
  }
  return undefined;
}

export function formatApiError(err: unknown, fallback: string, t: TFunction<"errors">): string {
  if (typeof err === "object" && err !== null) {
    const code = (err as ApiError).code;
    if (code) {
      const message = messageFromCode(code, t);
      if (message) return message;
    }
  }
  return fallback;
}
