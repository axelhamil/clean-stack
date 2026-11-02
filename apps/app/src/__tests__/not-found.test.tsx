import { createI18n, enCatalog } from "@packages/i18n";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { router } from "../router";

describe("unknown url", () => {
  it("given a path no route matches, when the app renders it, then it shows the not found page with a link home", async () => {
    const i18n = await createI18n({ locale: "en", resources: enCatalog });
    router.update({
      ...router.options,
      history: createMemoryHistory({ initialEntries: ["/no-such-page"] }),
    });
    await router.load();

    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>,
    );

    expect(html).toContain("<h1");
    expect(html).toContain("Page not found");
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Back to home<\/a>/);
  });
});
