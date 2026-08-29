export const LOCALES = ["en", "fr"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Narrows any untrusted value to a supported locale, falling back to the
 * default.
 *
 * Every boundary that reads a locale — a database column, a session payload, a
 * JSON body — holds `unknown` and must answer the same question, so the guard
 * lives once here rather than as a `isLocale(x) ? x : DEFAULT_LOCALE` ternary
 * repeated at each call site.
 */
export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
