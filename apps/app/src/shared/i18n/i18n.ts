import { createI18n, type Locale, loadCatalog, resolveLocale } from "@packages/i18n";
import type { i18n as I18nInstance } from "i18next";
import { readLocaleCookie, writeLocaleCookie } from "./locale-cookie";

function browserCandidates(): string[] {
  const cookie = readLocaleCookie();
  const navigatorLangs = typeof navigator === "undefined" ? [] : [...navigator.languages];
  return cookie ? [cookie, ...navigatorLangs] : navigatorLangs;
}

function syncDocumentLang(locale: string): void {
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}

export async function initI18n(): Promise<I18nInstance> {
  const locale = resolveLocale(browserCandidates());
  const resources = await loadCatalog(locale);
  const instance = await createI18n({ locale, resources });

  syncDocumentLang(locale);
  instance.on("languageChanged", syncDocumentLang);

  return instance;
}

/**
 * Switches the active language, loading its catalog on demand.
 *
 * The cookie is written here rather than at the call site so every path that
 * changes the language — the settings switcher and the session reconciliation
 * alike — leaves the same trace for the next page load to read.
 */
export async function changeLocale(instance: I18nInstance, locale: Locale): Promise<void> {
  if (instance.language === locale) return;
  if (!instance.hasResourceBundle(locale, "common")) {
    const resources = await loadCatalog(locale);
    for (const [namespace, bundle] of Object.entries(resources)) {
      instance.addResourceBundle(locale, namespace, bundle);
    }
  }
  await instance.changeLanguage(locale);
  writeLocaleCookie(locale);
}
