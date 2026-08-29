import { createInstance, type i18n } from "i18next";
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
 */
export async function createI18n({ locale, resources }: CreateI18nOptions): Promise<i18n> {
  const instance = createInstance();
  await instance.init({
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    load: "languageOnly",
    defaultNS: "common",
    ns: Object.keys(resources),
    resources: { [locale]: resources },
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return instance;
}
