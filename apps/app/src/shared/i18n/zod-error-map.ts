import type { TFunction } from "i18next";
import { z } from "zod";

/**
 * Installs localized Zod messages globally.
 *
 * Re-applied on every language change: `z.config` stores one map process-wide,
 * so a stale closure would keep emitting the previous language's messages long
 * after the UI switched.
 *
 * A per-issue `message:` literal on a check (`z.string().min(1, { message })`,
 * `.refine(fn, { message })`) always wins over this global map — that is Zod's
 * own precedence, not a bug here. Schemas must therefore stay message-free for
 * their built-in checks, and use `.refine(fn, { params: { i18nKey } })` instead
 * of `{ message }` for custom checks so `code === "custom"` below can still
 * route them through the catalog.
 */
export function applyZodErrorMap(t: TFunction<"errors">): void {
  z.config({
    customError: (issue) => {
      if (issue.code === "invalid_type" && issue.input === undefined) {
        return t("validation.required");
      }
      if (issue.code === "too_small") {
        // A string constrained to a minimum of 1 character is semantically
        // "required", not "must be at least 1 character" — matches how a
        // non-empty-string password/name field actually reads to a user.
        if (issue.origin === "string" && Number(issue.minimum) === 1) {
          return t("validation.required");
        }
        if (issue.origin === "array" || issue.origin === "set") {
          return t("validation.tooFewItems", { minimum: Number(issue.minimum) });
        }
        return t("validation.tooSmall", { minimum: Number(issue.minimum) });
      }
      if (issue.code === "too_big") {
        return t("validation.tooBig", { maximum: Number(issue.maximum) });
      }
      if (issue.code === "invalid_format") {
        if (issue.format === "email") return t("validation.invalidEmail");
        if (issue.format === "url") return t("validation.invalidUrl");
        return t("validation.invalidFormat");
      }
      if (issue.code === "custom" && typeof issue.params?.i18nKey === "string") {
        return t(issue.params.i18nKey as never);
      }
      return undefined;
    },
  });
}
