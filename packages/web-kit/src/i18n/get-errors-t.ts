import { enCatalog } from "@packages/i18n";
import type { TFunction } from "i18next";
import { getI18n } from "./i18n";

/**
 * Fixed `errors` namespace translator for code that runs outside the React
 * tree (global query-cache error handlers, `toast.ts`) and therefore cannot
 * call `useTranslation`. Falls back to returning the raw key (or the caller's
 * `defaultValue`) before `initI18n()` has resolved: tests and the earliest
 * paint before boot completes.
 */
export function getErrorsT(): TFunction<"errors"> {
  const instance = getI18n();
  if (instance) return instance.getFixedT(instance.language, "errors");
  return ((key: string, opts?: { defaultValue?: string }) =>
    opts?.defaultValue ?? key) as TFunction<"errors">;
}

export type ErrorFallbackKey = keyof typeof enCatalog.errors.fallback;

/**
 * The last-resort copy for a failed request (`errors.fallback.*`), resolved
 * when it is called, which is always at failure time: `throwApiError` calls it
 * while building the error, a hook's `onError` while raising the toast. Before
 * boot it answers with the English catalog value, never the raw key.
 */
export function errorFallback(key: ErrorFallbackKey): string {
  return getErrorsT()(`fallback.${key}`, { defaultValue: enCatalog.errors.fallback[key] });
}
