import { createI18n, enCatalog } from "@packages/i18n";
import { TooltipProvider } from "@packages/ui/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";
import { router } from "../router";
import { sessionQueryOptions } from "../shared/api/queries/session";
import { queryClient } from "../shared/api/query-client";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({ theme: "system", resolvedTheme: "light", setTheme: () => undefined }),
}));

const SHELL_HEADER = /<header(?![^>]*data-slot="page-header")/;

async function renderUnknownUrl() {
  const i18n = await createI18n({ locale: "en", resources: enCatalog });
  router.update({
    ...router.options,
    history: createMemoryHistory({ initialEntries: ["/no-such-page"] }),
  });
  await router.load();

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("unknown url", () => {
  afterEach(() => {
    queryClient.clear();
  });

  it("given a guest, when the app renders a path no route matches, then it shows the bare not found page with a link home", async () => {
    queryClient.setQueryData(sessionQueryOptions.queryKey, null);

    const html = await renderUnknownUrl();

    expect(html).toContain("<h1");
    expect(html).toContain("Page not found");
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Back to home<\/a>/);
    expect(html).not.toMatch(SHELL_HEADER);
  });

  it("given a signed in user, when the app renders a path no route matches, then it shows the not found page inside the app shell", async () => {
    queryClient.setQueryData(sessionQueryOptions.queryKey, {
      user: { id: "user-1", name: "Ada Lovelace", email: "ada@example.com" },
      session: { token: "token-1" },
    });

    const html = await renderUnknownUrl();

    expect(html).toMatch(SHELL_HEADER);
    expect(html).toContain("Page not found");
    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html.match(/<h1/g)).toHaveLength(1);
  });
});
