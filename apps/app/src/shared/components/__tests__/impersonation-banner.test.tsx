import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
const assign = vi.fn();
const clicks: Array<() => void> = [];

const session = {
  user: { id: "user_1", name: "Ada" },
  session: { impersonatedBy: "staff_1", expiresAt: new Date(Date.now() + 600_000).toISOString() },
};

vi.mock("../../auth/auth-client", () => ({
  authClient: { getSession: async () => ({ data: session, error: null }) },
}));
vi.mock("../../auth/auth-broadcast", () => ({ broadcastAuthChange: vi.fn() }));
vi.mock("../../api/mutations/stop-impersonation", () => ({
  stopImpersonationMutationOptions: { mutationFn: async () => ({ success: true }) },
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@packages/ui/components/ui/button", () => ({
  Button: ({ onClick }: { onClick: () => void }) => {
    clicks.push(onClick);
    return null;
  },
}));

async function endImpersonation() {
  vi.resetModules();
  const { ImpersonationBanner } = await import("../impersonation-banner");
  const { sessionQueryOptions } = await import("../../api/queries/session");
  const client = new QueryClient();
  client.setQueryData(sessionQueryOptions.queryKey, session);

  renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ImpersonationBanner />
    </QueryClientProvider>,
  );

  const click = clicks.at(-1);
  if (!click) throw new Error("the banner rendered no end button");
  click();
  await vi.waitFor(() => expect(assign.mock.calls.length + navigate.mock.calls.length).toBe(1));
}

beforeEach(() => {
  vi.stubGlobal("window", { location: { assign } });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  clicks.length = 0;
});

describe("impersonation banner", () => {
  it("ends the impersonation and returns to the impersonated user in the back office", async () => {
    vi.stubEnv("VITE_ADMIN_URL", "https://admin.test");

    await endImpersonation();

    expect(assign).toHaveBeenCalledWith("https://admin.test/users/user_1");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("falls back to the dashboard without a back office URL", async () => {
    vi.stubEnv("VITE_ADMIN_URL", "");

    await endImpersonation();

    expect(navigate).toHaveBeenCalledWith({ to: "/dashboard" });
    expect(assign).not.toHaveBeenCalled();
  });
});
