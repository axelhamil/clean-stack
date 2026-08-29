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

/**
 * Resolves the localised copy for one error code, exact override first, suffix
 * default second. Exported because BetterAuth errors go through the same
 * catalog: two lookups over one registry is one lookup that will drift.
 */
export function messageFromCode(code: string, t: TFunction<"errors">): string | undefined {
  const exact = t(`byCode.${code}` as never, { defaultValue: "" });
  if (exact) return exact;
  for (const suffix of SUFFIXES) {
    if (code.endsWith(`_${suffix}`)) return t(`bySuffix.${suffix}` as never);
  }
  return undefined;
}

/**
 * Last resort when the catalog has nothing for this rejection.
 *
 * The catalog wins whenever it has an answer — that is what keeps the app from
 * speaking two languages at once. But a 4xx the catalog does not cover is a
 * rejection the user could have acted on, and `isUnexpectedError` filters
 * sub-500 statuses out of telemetry, so falling back to generic copy makes it
 * invisible to the user *and* to us. Restricted to 4xx on purpose: a network
 * failure ("Failed to fetch") and a 5xx ("Internal Server Error") say nothing
 * the caller's own localised fallback does not say better.
 */
function serverMessage(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const { status, message } = err as ApiError;
  if (typeof status !== "number" || status < 400 || status >= 500) return undefined;
  return typeof message === "string" && message.length > 0 ? message : undefined;
}

export function formatApiError(err: unknown, fallback: string, t: TFunction<"errors">): string {
  if (typeof err === "object" && err !== null) {
    const code = (err as ApiError).code;
    if (code) {
      const message = messageFromCode(code, t);
      if (message) return message;
    }
  }
  return serverMessage(err) ?? fallback;
}
