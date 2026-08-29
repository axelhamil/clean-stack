import { createI18n, enCatalog } from "@packages/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { DataRightsNotice } from "../components/data-rights-notice";

// `Link` needs a live router context (`useRouter()`) to resolve `to` — the only
// thing this test mocks. `DataRightsNotice` itself, imported from the real
// production file, is never touched: this is what caught the crash.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    className,
    children,
  }: {
    to: string;
    className?: string;
    children?: React.ReactNode;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

/**
 * Regression test for the account settings page crash: `Trans` cloned the
 * OUTER mapped element with the translated text as `children`, discarding a
 * wrapped inner element with no children of its own (`NavLink asChild` around
 * a childless `<Link />`). `NavLink`'s Radix `Slot` then received a string
 * child instead of a single React element and threw `Slot expected a single
 * React element child`. The fix (`components/data-rights-notice.tsx`) maps
 * the tag straight to the innermost element (`Link` with a `navLinkVariants`
 * className) so `Trans`'s cloned children land on the actual anchor.
 *
 * This renders the real, unmodified `DataRightsNotice` export — not a
 * hand-copied reproduction of its JSX — so a regression in the production
 * file fails this test.
 */
describe("account settings — data rights notice", () => {
  it("renders without throwing", async () => {
    const i18n = await createI18n({ locale: "en", resources: enCatalog });

    const render = () =>
      renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <DataRightsNotice />
        </I18nextProvider>,
      );

    expect(render).not.toThrow();

    const html = render();
    expect(html).toContain('href="/legal/data-rights"');
    expect(html).toMatch(/<a[^>]*href="\/legal\/data-rights"[^>]*>data rights policy<\/a>/);
  });
});
