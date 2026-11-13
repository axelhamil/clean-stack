import type { Locale } from "@packages/i18n";

export interface ILocaleReader {
  localeOf(userId: string): Promise<Locale>;
}
