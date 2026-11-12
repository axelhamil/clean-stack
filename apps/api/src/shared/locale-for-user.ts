import type { ProfileError } from "@modules/profile/application/ports/profile.port";
import type { Option, Result } from "@packages/ddd-kit";
import { DEFAULT_LOCALE, type Locale } from "@packages/i18n";
import type { IProfileStore } from "./ports/profile.port";

function collapse(found: Result<Option<Locale>, ProfileError>): Locale {
  if (found.isFailure) return DEFAULT_LOCALE;
  return found.getValue().toUndefined() ?? DEFAULT_LOCALE;
}

/**
 * Resolves the locale a message to `userId` must be written in.
 *
 * Every notifier asks the same question and must survive the same two
 * non-answers (a store failure and a user who never picked a language) by
 * falling back to the default rather than skipping the send. Keeping that
 * collapse in one place is what stops a new notifier from inventing a third
 * behaviour (throwing, or sending nothing) for a locale lookup that was never
 * essential to the message.
 */
export async function localeForUser(store: IProfileStore, userId: string): Promise<Locale> {
  return collapse(await store.findLocale(userId));
}

/**
 * Resolves the locale to write a message in when the hook only hands over an
 * address. Magic-link sign-in is the one auth flow with no user object in
 * scope; an address with no account yet legitimately falls back to the
 * default rather than failing the send.
 */
export async function localeForEmail(store: IProfileStore, email: string): Promise<Locale> {
  return collapse(await store.findLocaleByEmail(email));
}
