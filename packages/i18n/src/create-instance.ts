import { createInstance, type i18n } from "i18next";
import enCatalog from "./catalogs/en";
import type { Resources } from "./load-catalog";
import { DEFAULT_LOCALE, type Locale } from "./locales";
import "./types";

export interface CreateI18nOptions {
  locale: Locale;
  resources: Resources;
}

/**
 * Builds an isolated i18next instance.
 *
 * Always a fresh instance, never a shared singleton: the email worker renders
 * for many recipients in sequence, and a shared mutable `language` would leak
 * one recipient's locale into the next one's message.
 *
 * The English catalog is always registered under `DEFAULT_LOCALE`, in
 * addition to the target locale's resources — `fallbackLng: DEFAULT_LOCALE`
 * is otherwise a no-op: i18next can only fall back to a language whose
 * resources are actually loaded into the instance. Without this, a key
 * missing from a non-English catalog renders as the raw key string instead
 * of the English copy, silently defeating the whole premise of shipping a
 * partial translation.
 */
export async function createI18n({ locale, resources }: CreateI18nOptions): Promise<i18n> {
  const instance = createInstance();
  await instance.init({
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    load: "languageOnly",
    defaultNS: "common",
    ns: Object.keys(resources),
    resources: {
      [DEFAULT_LOCALE]: enCatalog,
      [locale]: resources,
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return instance;
}
