import { DEFAULT_LOCALE, type Locale } from "@packages/i18n";
import type { IProfileStore } from "./ports/profile.port";

/**
 * Resolves the locale a message to `userId` must be written in.
 *
 * Every notifier asks the same question and must survive the same two
 * non-answers — a store failure and a user who never picked a language — by
 * falling back to the default rather than skipping the send. Keeping that
 * collapse in one place is what stops a new notifier from inventing a third
 * behaviour (throwing, or sending nothing) for a locale lookup that was never
 * essential to the message.
 */
export async function localeForUser(store: IProfileStore, userId: string): Promise<Locale> {
  const stored = await store.findLocale(userId);
  if (stored.isFailure) return DEFAULT_LOCALE;
  return stored.getValue().toUndefined() ?? DEFAULT_LOCALE;
}
