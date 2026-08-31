import { CONSENT_CATEGORIES } from "@packages/cookie-consent";
import { createI18n, enCatalog, loadCatalog } from "@packages/i18n";
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

describe("cookies.route table caption — legal.cookies.tableCaption", () => {
  // Round 2 review: the caption used to be a fixed English record, which
  // stayed English even once the heading above it (and the rest of the
  // page's chrome) was French. It's now `t("legal.cookies.tableCaption", {
  // category: t(CATEGORY_LABEL_KEYS[cat]) })` — one key, the category
  // interpolated through the same keys the consent panel already uses. This
  // renders all four through the real French catalog to check the sentence
  // still reads once the category name is a French noun, not just that the
  // key resolves.
  it("reads well in French for all four categories", async () => {
    const i18n = await createI18n({ locale: "fr", resources: await loadCatalog("fr") });
    const captionFor = (category: string) => i18n.t("legal.cookies.tableCaption", { category });

    expect(captionFor(i18n.t("cookieConsent.categories.necessary.label"))).toBe(
      "Cookies de la catégorie Strictement nécessaires utilisés par cette application",
    );
    expect(captionFor(i18n.t("cookieConsent.categories.functional.label"))).toBe(
      "Cookies de la catégorie Fonctionnels utilisés par cette application",
    );
    expect(captionFor(i18n.t("cookieConsent.categories.analytics.label"))).toBe(
      "Cookies de la catégorie Mesure d'audience utilisés par cette application",
    );
    expect(captionFor(i18n.t("cookieConsent.categories.marketing.label"))).toBe(
      "Cookies de la catégorie Marketing et publicité utilisés par cette application",
    );
  });

  it("reads well in English for all four categories", async () => {
    const i18n = await createI18n({ locale: "en", resources: enCatalog });
    const captionFor = (category: string) => i18n.t("legal.cookies.tableCaption", { category });

    expect(captionFor(i18n.t("cookieConsent.categories.necessary.label"))).toBe(
      "Cookies in the Strictly necessary category used by this application",
    );
    expect(captionFor(i18n.t("cookieConsent.categories.marketing.label"))).toBe(
      "Cookies in the Marketing category used by this application",
    );
  });
});
