import type { Locale } from "@packages/i18n";

export const LOCALE_COOKIE = "locale";

const ONE_YEAR_SECONDS = 31_536_000;

export function readLocaleCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;
  for (const part of document.cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LOCALE_COOKIE) return rest.join("=") || undefined;
  }
  return undefined;
}

export function writeLocaleCookie(locale: Locale): void {
  if (typeof document === "undefined") return;
  // biome-ignore lint/suspicious/noDocumentCookie: no secret, must be readable pre-render — the Cookie Store API is async and unavailable in Safari/Firefox.
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}
