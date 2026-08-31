import { createI18n, enCatalog, loadCatalog } from "@packages/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { isEnglishFallback, policyBodyFor } from "../policies";
import { PolicyDocView } from "../policy-doc-view";

// `POLICY_VERSIONS`/`POLICY_CHANGELOG` currently give privacy/terms the same
// `version` and `effectiveDate` ("2026-01-15" for both), which makes the
// version-line assertions below blind to an interpolation-order bug: passing
// `{ version: effectiveDate, date: version }` instead of `{ version, date:
// effectiveDate }` at the call site would render a byte-identical string.
// Mocking distinct fixture values (rather than editing production data) is
// what actually pins the order — see the "kills the version/date swap"
// assertions further down, and the round-1 review report for the swap-and-
// revert proof.
vi.mock("../policies.config", () => ({
  POLICY_DOCS: {
    privacy: { type: "privacy", version: "9.9.9", effectiveDate: "1111-11-11", summary: "" },
    terms: { type: "terms", version: "8.8.8", effectiveDate: "2222-02-02", summary: "" },
  },
}));

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

  it("renders the translated chrome — title and the version/effective line, in the right order", async () => {
    const html = await renderPrivacyPage("fr");
    expect(html).toContain("Politique de confidentialité");
    // Fixture: version "9.9.9", effectiveDate "1111-11-11" — distinct on
    // purpose, so a `{ version, date }` argument swap renders a different,
    // wrong string instead of an indistinguishable one.
    expect(html).toContain("Version 9.9.9 — en vigueur depuis le 1111-11-11");
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

  it("renders the English chrome, in the right order", async () => {
    const html = await renderPrivacyPage("en");
    expect(html).toContain("Privacy Policy");
    expect(html).toContain("Version 9.9.9 — effective 1111-11-11");
  });
});
