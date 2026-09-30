import { describe, expect, it, vi } from "vitest";

vi.mock("../../../auth/auth-client", () => ({
  authClient: { subscription: { upgrade: vi.fn(async () => ({ error: null })) } },
}));

import { authClient } from "../../../auth/auth-client";
import type { UpgradeInput } from "../upgrade-subscription";
import { upgradeSubscriptionMutationOptions } from "../upgrade-subscription";

type MockSubscription = { subscription: { upgrade: ReturnType<typeof vi.fn> } };

describe("upgradeSubscriptionMutationOptions", () => {
  it("calls authClient.subscription.upgrade with the org referenceId", async () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost" } });
    const fn = upgradeSubscriptionMutationOptions.mutationFn as
      | ((v: UpgradeInput) => Promise<void>)
      | undefined;
    await fn?.({ tier: "pro", organizationId: "org1" });
    expect((authClient as unknown as MockSubscription).subscription.upgrade).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "pro", referenceId: "org1" }),
    );
  });

  it("rejects with the BetterAuth status and code instead of a bare message", async () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost" } });
    const { upgrade } = (authClient as unknown as MockSubscription).subscription;
    upgrade.mockResolvedValueOnce({
      error: { code: "SUBSCRIPTION_NOT_FOUND", status: 404, message: "no subscription" },
    });
    const fn = upgradeSubscriptionMutationOptions.mutationFn as (v: UpgradeInput) => Promise<void>;

    const err = await fn({ tier: "pro", organizationId: "org1" }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ status: 404, code: "SUBSCRIPTION_NOT_FOUND" });
  });
});
