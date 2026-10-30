import { createI18n, enCatalog } from "@packages/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { sessionQueryOptions } from "../../../shared/api/queries/session";
import { Route } from "../accept.route";

vi.mock("../../../shared/auth/auth-client", () => ({ authClient: {} }));
vi.mock("../hooks/use-accept-invitation", () => ({
  useAcceptInvitation: () => ({ isPending: false, isError: false }),
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: () => "sign-in-link",
}));

async function renderWithFailedSessionCheck(cached: null | undefined) {
  vi.spyOn(Route, "useParams").mockReturnValue({ invitationId: "invitation-1" });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } });
  if (cached === null) queryClient.setQueryData(sessionQueryOptions.queryKey, null);
  const query = queryClient
    .getQueryCache()
    .build(queryClient, { queryKey: [...sessionQueryOptions.queryKey] });
  query.setState({ status: "error", error: new Error("down"), fetchStatus: "idle" });
  const i18n = await createI18n({ locale: "en", resources: enCatalog });
  const Page = Route.options.component;
  if (!Page) throw new Error("the accept route has no component");

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <Page />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

describe("accept invitation route", () => {
  it.each([
    ["no cached session", undefined],
    ["a cached signed out state", null],
  ] as const)(
    "given a failed session check and %s, when the page renders, then it does not ask to sign in",
    async (_label, cached) => {
      const html = await renderWithFailedSessionCheck(cached);

      expect(html).toContain('role="alert"');
      expect(html).toContain(">Retry<");
      expect(html).not.toContain("sign-in-link");
    },
  );
});
