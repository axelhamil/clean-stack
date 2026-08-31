import type { Locale } from "@packages/i18n";
import { createI18n, enCatalog, loadCatalog } from "@packages/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { UntranslatedBodyBanner } from "../components/untranslated-body-banner";

// Tests the shared component directly — this is the thing every legal page
// actually renders, and the thing round 1 was told to promote instead of
// copying the `<Alert>` four times. A page-level render would only prove the
// same condition indirectly, through four extra components, and would need
// re-writing for a fifth page; this doesn't.
async function renderBanner(locale: Locale, show: boolean) {
  const resources = locale === "en" ? enCatalog : await loadCatalog("fr");
  const i18n = await createI18n({ locale, resources });
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <UntranslatedBodyBanner show={show} />
    </I18nextProvider>,
  );
}

describe("UntranslatedBodyBanner", () => {
  it("renders the disclosure under French when show is true", async () => {
    const html = await renderBanner("fr", true);
    // `renderToStaticMarkup` HTML-escapes the apostrophe (`&#x27;`); this
    // substring avoids it while still pinning the actual banner copy.
    expect(html).toContain("Vous consultez la version anglaise ci-dessous");
  });

  it("renders nothing when show is false, regardless of locale", async () => {
    expect(await renderBanner("fr", false)).toBe("");
    expect(await renderBanner("en", false)).toBe("");
  });

  it("is driven by `show` alone, with no redundant locale check of its own", async () => {
    // The component takes the locale *condition* as a prop rather than
    // computing it — each call site owns why (`isEnglishFallback` for
    // `policy-doc-view.tsx`, a plain `locale !== "en"` for the other four
    // pages). Rendering it under English with `show=true` still shows the
    // disclosure: proof there is no second, buried locale gate in here that
    // could silently disagree with a call site's own logic.
    const html = await renderBanner("en", true);
    expect(html).toContain("This document is not yet available in your language");
  });
});
