import { createI18n, enCatalog, loadCatalog } from "@packages/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { isEnglishFallback, policyBodyFor } from "../policies";
import { PolicyDocView } from "../policy-doc-view";

async function renderPrivacyPage(locale: "en" | "fr") {
  const resources = locale === "en" ? enCatalog : await loadCatalog("fr");
  const i18n = await createI18n({ locale, resources });
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <PolicyDocView type="privacy" />
    </I18nextProvider>,
  );
}

describe("isEnglishFallback", () => {
  // Two assertions that together kill the two mutants that matter on the
  // banner's condition (`locale !== "en" && bodyIsEnglish`):
  // - flipping `!==` to `===` makes the English page itself claim a fallback
  //   (the "en" case below would flip from false to true);
  // - dropping the locale check entirely makes it always compare the English
  //   body to itself, which is always true, so it never distinguishes a
  //   locale with real translated prose from one still on the placeholder
  //   (same "en" case catches it, since the identity is trivially true).
  it("never fires for the English locale itself", () => {
    expect(isEnglishFallback("en", "privacy")).toBe(false);
    expect(isEnglishFallback("en", "terms")).toBe(false);
  });

  // `fr.tsx` re-exports `en.tsx` verbatim today (R3), so this is the honest,
  // currently-true state of the world — not a hardcoded locale check.
  it("fires for a locale still on the English body", () => {
    expect(isEnglishFallback("fr", "privacy")).toBe(true);
    expect(isEnglishFallback("fr", "terms")).toBe(true);
    expect(policyBodyFor("fr", "privacy")).toBe(policyBodyFor("en", "privacy"));
  });
});

describe("PolicyDocView — French locale", () => {
  it("shows the untranslated-language banner", async () => {
    const html = await renderPrivacyPage("fr");
    // `renderToStaticMarkup` HTML-escapes the apostrophe (`&#x27;`); this
    // substring avoids it while still pinning the actual banner copy.
    expect(html).toContain("Vous consultez la version anglaise ci-dessous");
  });

  it("still renders the real English body underneath (the fallback is real, not blank)", async () => {
    const html = await renderPrivacyPage("fr");
    expect(html).toContain(
      "This is boilerplate placeholder prose. Replace with your actual Privacy Policy",
    );
    expect(html).not.toContain("legal.policies.unavailableBanner");
  });

  it("renders the translated chrome — title and the version/effective line", async () => {
    const html = await renderPrivacyPage("fr");
    expect(html).toContain("Politique de confidentialité");
    expect(html).toContain("Version 2026-01-15 — en vigueur depuis le 2026-01-15");
  });
});

describe("PolicyDocView — English locale", () => {
  it("never shows the banner", async () => {
    const html = await renderPrivacyPage("en");
    expect(html).not.toContain(
      "This document is not yet available in your language. You are reading the English version below.",
    );
    expect(html).not.toContain("Ce document n'est pas encore disponible");
  });

  it("renders the English chrome", async () => {
    const html = await renderPrivacyPage("en");
    expect(html).toContain("Privacy Policy");
    expect(html).toContain("Version 2026-01-15 — effective 2026-01-15");
  });
});
