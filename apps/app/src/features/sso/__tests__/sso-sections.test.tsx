import { createI18n, enCatalog } from "@packages/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { ssoProvidersQueryOptions } from "../api/sso.queries";
import { Route } from "../sso.route";

vi.mock("../api/sso.queries", () => ({
  ssoProvidersQueryOptions: { queryKey: ["sso-providers"], queryFn: () => [] },
}));
vi.mock("../../../shared/auth/ensure-org-permission", () => ({
  ensureOrgPermission: () => () => undefined,
}));
vi.mock("../../../shared/auth/use-entitlements", () => ({
  useEntitlements: () => ({ hasFeature: () => true }),
}));
vi.mock("../components/provider-card", () => ({ ProviderCard: () => "provider-card-mounted" }));
vi.mock("../components/domain-verification-card", () => ({ DomainVerificationCard: () => null }));
vi.mock("../components/sso-enforcement-card", () => ({ SsoEnforcementCard: () => null }));
vi.mock("../components/scim-connection-card", () => ({ ScimConnectionCard: () => null }));

async function renderWithProvidersQuery(seed: (queryClient: QueryClient) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retryOnMount: false } } });
  seed(queryClient);
  const i18n = await createI18n({ locale: "en", resources: enCatalog });
  const Page = Route.options.component;
  if (!Page) throw new Error("the SSO route has no component");

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <Page />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

function failFetch(queryClient: QueryClient) {
  const query = queryClient
    .getQueryCache()
    .build(queryClient, { queryKey: [...ssoProvidersQueryOptions.queryKey] });
  query.setState({ status: "error", error: new Error("down"), fetchStatus: "idle" });
}

describe("SSO sections", () => {
  it("given loaded providers, when a refetch fails, then the sections stay mounted", async () => {
    const html = await renderWithProvidersQuery((queryClient) => {
      queryClient.setQueryData(ssoProvidersQueryOptions.queryKey, []);
      failFetch(queryClient);
    });

    expect(html).toContain("provider-card-mounted");
    expect(html).not.toContain('role="alert"');
  });

  it("given a first load that fails, when the page renders, then it offers a retry", async () => {
    const html = await renderWithProvidersQuery(failFetch);

    expect(html).toContain('role="alert"');
    expect(html).toContain(">Retry<");
    expect(html).not.toContain("provider-card-mounted");
  });
});
