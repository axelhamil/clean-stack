import { CONSENT_CATEGORIES } from "@packages/cookie-consent";
import { describe, expect, it } from "vitest";
import { CATEGORY_LABEL_KEYS } from "../cookie-category-labels";

describe("CATEGORY_LABEL_KEYS", () => {
  // `satisfies Record<ConsentCategory, string>` proves every category has a
  // key. It cannot prove `analytics` points at the analytics copy — swapping
  // two entries type-checks and renders. Only naming each pair catches that.
  it("points each category at its own consent-panel label key", () => {
    expect(CATEGORY_LABEL_KEYS).toStrictEqual({
      necessary: "cookieConsent.categories.necessary.label",
      functional: "cookieConsent.categories.functional.label",
      analytics: "cookieConsent.categories.analytics.label",
      marketing: "cookieConsent.categories.marketing.label",
    });
  });

  it("covers every category in CONSENT_CATEGORIES, with no orphan entry", () => {
    expect(Object.keys(CATEGORY_LABEL_KEYS).toSorted()).toEqual([...CONSENT_CATEGORIES].toSorted());
  });
});
