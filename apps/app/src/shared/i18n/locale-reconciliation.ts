import { isLocale, type Locale } from "@packages/i18n";

/**
 * The locale the user explicitly picked in this browsing session, if any.
 *
 * Module-level rather than React state because the two sides of the decision
 * live in different trees: the switcher (`features/account`) records the
 * choice, `LocaleSync` (mounted at the app root) consults it. Both read the
 * same session query, and that query is not the authority here — BetterAuth
 * serves the session from a cookie cache, so for up to a minute after a
 * successful save the user row still reports the OLD locale. Without this
 * marker `LocaleSync` would re-assert that stale value and revert both the UI
 * and the locale cookie the switcher just wrote.
 */
let chosenLocale: Locale | undefined;

export function markLocaleChosen(locale: Locale): void {
  chosenLocale = locale;
}

export function getChosenLocale(): Locale | undefined {
  return chosenLocale;
}

export function resetChosenLocale(): void {
  chosenLocale = undefined;
}

export type LocaleReconciliation =
  | { action: "none" }
  | { action: "apply"; locale: Locale }
  | { action: "persist"; locale: Locale };

export interface ReconcileLocaleInput {
  userLocale: unknown;
  activeLocale: string;
  chosenLocale: Locale | undefined;
  impersonated: boolean;
  alreadyPersisted: boolean;
}

/**
 * Decides what the session/browser locale reconciliation should do, as a pure
 * function so the "does a save bounce back?" question is answerable without a
 * DOM: `LocaleSync` only wires the effect around it.
 *
 * The server record wins by default — it is the value the emails are sent in —
 * except while it contradicts a locale the user just picked here, which is the
 * one case where the server is knowably behind rather than authoritative. When
 * the record holds no locale at all it is seeded once from the resolved
 * browser locale, otherwise a user who never opens their settings keeps a null
 * locale forever and reads a French UI while receiving English email.
 */
export function reconcileLocale(input: ReconcileLocaleInput): LocaleReconciliation {
  const { userLocale, activeLocale, chosenLocale: chosen, impersonated, alreadyPersisted } = input;

  if (isLocale(userLocale)) {
    if (chosen !== undefined && chosen !== userLocale) return { action: "none" };
    if (userLocale === activeLocale) return { action: "none" };
    return { action: "apply", locale: userLocale };
  }

  if (impersonated || alreadyPersisted || !isLocale(activeLocale)) return { action: "none" };

  return { action: "persist", locale: activeLocale };
}
