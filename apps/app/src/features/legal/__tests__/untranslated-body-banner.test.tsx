import type { Locale } from "@packages/i18n";
import { createI18n, enCatalog, loadCatalog } from "@packages/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { AccessibilityPage } from "../accessibility.route";
import { CookiesPage } from "../cookies.route";
import { DataRightsPage } from "../data-rights.route";
import { SubProcessorsPage } from "../sub-processors.route";

// `Link` needs a live router context (`useRouter()`) — the only thing this
// mocks. `DataRightsPage` itself, imported from the real production file, is
// never touched (same pattern as `data-rights-notice.test.tsx`).
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children?: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  createFileRoute: () => (opts: unknown) => opts,
}));

// `ConsentSettings` reads live query/mutation state (`useQuery`/`useMutation`)
// that needs a `QueryClientProvider` and a real API to resolve meaningfully.
// Neither the banner nor the category labels under test live inside it, so
// it's stubbed out the same way `Link` is above — `CookiesPage` itself is
// still the real, unmodified production export.
vi.mock("../../../shared/components/consent-settings", () => ({
  ConsentSettings: () => null,
}));

async function renderUnder(locale: Locale, Page: () => React.ReactElement) {
  const resources = locale === "en" ? enCatalog : await loadCatalog("fr");
  const i18n = await createI18n({ locale, resources });
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <Page />
    </I18nextProvider>,
  );
}

const BANNER_FR_SUBSTRING = "Vous consultez la version anglaise ci-dessous";
const BANNER_EN_STRINGS = [
  "This document is not yet available in your language",
  "Ce document n'est pas encore disponible",
];

describe.each([
  ["accessibility", AccessibilityPage, "Déclaration", "Accessibility statement"],
  ["data rights", DataRightsPage, "Vos droits sur vos données", "Your data rights"],
  ["sub-processors", SubProcessorsPage, "Registre des sous-traitants", "Sub-processor disclosure"],
] as const)("%s page — untranslated-body banner", (_name, Page, frTitle, enTitle) => {
  it("discloses the untranslated body under French", async () => {
    const html = await renderUnder("fr", Page);
    expect(html).toContain(frTitle);
    expect(html).toContain(BANNER_FR_SUBSTRING);
  });

  it("shows no banner under English", async () => {
    const html = await renderUnder("en", Page);
    expect(html).toContain(enTitle);
    for (const s of BANNER_EN_STRINGS) expect(html).not.toContain(s);
  });
});

describe("cookies page — untranslated-body banner and category labels", () => {
  it("discloses the untranslated body and renders the category labels in French", async () => {
    const html = await renderUnder("fr", CookiesPage);
    expect(html).toContain("Politique de cookies");
    expect(html).toContain(BANNER_FR_SUBSTRING);
    // The four category headings, now sourced from `common.cookieConsent`
    // (shared with the consent panel) rather than a second English-only copy.
    expect(html).toContain("Strictement nécessaires");
    expect(html).toContain("Fonctionnels");
    expect(html).toContain("Mesure d");
    expect(html).toContain("Marketing et publicité");
    // The table captions stay English on purpose (see the comment in
    // `cookies.route.tsx`) — asserting their continued presence pins that
    // decision rather than letting it silently drift.
    expect(html).toContain("Strictly necessary cookies used by this application");
  });

  it("shows no banner and the English category labels under English", async () => {
    const html = await renderUnder("en", CookiesPage);
    expect(html).toContain("Cookie policy");
    for (const s of BANNER_EN_STRINGS) expect(html).not.toContain(s);
    expect(html).toContain("Strictly necessary");
    expect(html).toContain("Functional");
    expect(html).toContain("Analytics");
    expect(html).toContain("Marketing");
  });
});
