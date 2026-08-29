import { DEFAULT_LOCALE, isLocale, type Locale } from "./locales";

/**
 * Picks the first supported locale from an ordered preference list.
 *
 * Candidates come from the `locale` cookie first, then `navigator.languages`.
 * A region subtag is dropped (`fr-BE` -> `fr`) to match i18next's
 * `load: "languageOnly"`, so resolution and i18next never disagree on which
 * catalog a browser language maps to.
 */
export function resolveLocale(candidates: readonly string[]): Locale {
  for (const candidate of candidates) {
    const base = candidate.trim().toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
