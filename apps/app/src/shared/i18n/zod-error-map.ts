import type { TFunction } from "i18next";
import { z } from "zod";

/**
 * Installs localized Zod messages globally.
 *
 * Re-applied on every language change: `z.config` stores one map process-wide,
 * so a stale closure would keep emitting the previous language's messages long
 * after the UI switched.
 */
export function applyZodErrorMap(t: TFunction<"errors">): void {
  z.config({
    customError: (issue) => {
      if (issue.code === "invalid_type" && issue.input === undefined) {
        return t("validation.required");
      }
      if (issue.code === "invalid_format" && issue.format === "email") {
        return t("validation.invalidEmail");
      }
      if (issue.code === "too_small") {
        return t("validation.tooSmall", { minimum: Number(issue.minimum) });
      }
      if (issue.code === "too_big") {
        return t("validation.tooBig", { maximum: Number(issue.maximum) });
      }
      return undefined;
    },
  });
}
