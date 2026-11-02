import { TooltipProvider } from "@packages/ui/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { consentQueryOptions } from "../../api/queries/consent";
import { sessionQueryOptions } from "../../api/queries/session";
import { ConsentSettings } from "../consent-settings";
import { CookieBanner } from "../cookie-banner";

function render(ui: ReactNode, impersonatedBy: string | null) {
  const client = new QueryClient();
  client.setQueryData(consentQueryOptions.queryKey, { categories: null, policyVersion: null });
  client.setQueryData([...sessionQueryOptions.queryKey], {
    user: { id: "u1" },
    session: { impersonatedBy },
  });

  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("cookie consent under impersonation", () => {
  it("given no recorded choice, when impersonating, then the banner stays hidden", () => {
    expect(render(<CookieBanner />, "admin-1")).toBe("");
    expect(render(<CookieBanner />, null)).toContain("cookieBanner.acceptAll");
  });

  it("given the settings, when impersonating, then saving and withdrawing are frozen", () => {
    const frozen = render(<ConsentSettings />, "admin-1");
    const open = render(<ConsentSettings />, null);

    expect(frozen.match(/<button data-slot="button"[^>]* disabled=""/g)).toHaveLength(2);
    expect(open.match(/<button data-slot="button"[^>]* disabled=""/g)).toBeNull();
  });
});
