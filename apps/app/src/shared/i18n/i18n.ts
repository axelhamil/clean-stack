import {
  createI18n,
  DEFAULT_LOCALE,
  type Locale,
  loadCatalog,
  resolveLocale,
} from "@packages/i18n";
import type { i18n as I18nInstance } from "i18next";
import { captureError } from "../observability/sentry";
import { readLocaleCookie, writeLocaleCookie } from "./locale-cookie";

function browserCandidates(): string[] {
  const cookie = readLocaleCookie();
  const navigatorLangs = typeof navigator === "undefined" ? [] : [...navigator.languages];
  return cookie ? [cookie, ...navigatorLangs] : navigatorLangs;
}

function syncDocumentLang(locale: string): void {
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}

let activeInstance: I18nInstance | undefined;

/**
 * Read-only access to the booted i18next instance for code that cannot use
 * `useTranslation` — the global `QueryCache`/`MutationCache` error handlers
 * (`observability/query-error-handler.ts`) and `toast.ts` run outside the
 * React tree entirely. `undefined` before `initI18n()` resolves (tests,
 * SSR); callers fall back to an untranslated default in that case.
 */
export function getI18n(): I18nInstance | undefined {
  return activeInstance;
}

async function bootInstance(locale: Locale): Promise<I18nInstance> {
  const resources = await loadCatalog(locale);
  const instance = await createI18n({ locale, resources });

  syncDocumentLang(locale);
  instance.on("languageChanged", syncDocumentLang);
  activeInstance = instance;

  return instance;
}

/**
 * Resolves the boot locale and builds the i18next instance for it.
 *
 * A rejected dynamic catalog import (bad network mid-boot) must not leave the
 * app on a blank screen: the failure is reported to telemetry and the boot
 * retries once against `DEFAULT_LOCALE`, whose catalog is a static import and
 * therefore not subject to the same network failure. Only a second failure —
 * meaning the bundle itself is broken, not the network — propagates.
 */
export async function initI18n(): Promise<I18nInstance> {
  try {
    const locale = resolveLocale(browserCandidates());
    return await bootInstance(locale);
  } catch (error) {
    captureError(error, { stage: "i18n-init" });
    try {
      return await bootInstance(DEFAULT_LOCALE);
    } catch (fallbackError) {
      captureError(fallbackError, { stage: "i18n-init-fallback" });
      throw fallbackError;
    }
  }
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
