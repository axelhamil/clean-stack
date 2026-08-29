import { createI18n, enCatalog } from "@packages/i18n";
import { navLinkVariants } from "@packages/ui/components/ui/nav-link";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider, Trans } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

// `Link` needs a live router context outside the app tree; this test only cares
// that `Trans` composes correctly with a single childless element, so a plain
// anchor stands in for it.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, className, children }: { to: string; className?: string; children?: ReactNode }) => (
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
 * React element child`. The fix maps the tag straight to the innermost
 * element (`Link` with a `navLinkVariants` className) so `Trans`'s cloned
 * children land on the actual anchor.
 */
describe("account settings — data rights notice", () => {
  it("renders the settings:account.dataRightsNotice Trans without throwing", async () => {
    const i18n = await createI18n({ locale: "en", resources: enCatalog });

    const render = () =>
      renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <Trans
            ns="settings"
            i18nKey="account.dataRightsNotice"
            components={{
              link: (
                <Link
                  to="/legal/data-rights"
                  className={navLinkVariants({ variant: "underline" })}
                />
              ),
            }}
          />
        </I18nextProvider>,
      );

    expect(render).not.toThrow();

    const html = render();
    expect(html).toContain('href="/legal/data-rights"');
    expect(html).toContain("data rights policy");
  });
});
