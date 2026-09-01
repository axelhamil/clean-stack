import type { Locale } from "@packages/i18n";
import type { PolicyType } from "@packages/policies";
import type { ReactElement } from "react";
import * as en from "./en";
import * as fr from "./fr";

type PolicyBodies = Record<PolicyType, () => ReactElement>;

const BODIES_BY_LOCALE: Record<Locale, PolicyBodies> = {
  en: { privacy: en.PrivacyPolicyBody, terms: en.TermsBody },
  fr: { privacy: fr.PrivacyPolicyBody, terms: fr.TermsBody },
};

export function policyBodyFor(locale: Locale, type: PolicyType): () => ReactElement {
  return BODIES_BY_LOCALE[locale][type];
}

// `fr.tsx` re-exports `en.tsx`'s components by reference today, so comparing
// the resolved body against the canonical English one by identity is what
// makes this check honest, per R3: it fires the fallback banner for every
// locale that hasn't gotten its own prose yet, and keeps working unchanged —
// with nobody having to touch this file — the day a clone owner replaces
// `fr.tsx` with real French components (the identity then differs, so the
// banner stops firing on its own).
export function isEnglishFallback(locale: Locale, type: PolicyType): boolean {
  return locale !== "en" && BODIES_BY_LOCALE[locale][type] === BODIES_BY_LOCALE.en[type];
}
