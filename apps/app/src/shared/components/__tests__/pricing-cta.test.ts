import { describe, expect, it } from "vitest";
import { resolvePricingCta, resolvePrimaryTier } from "../pricing-table";

describe("resolvePricingCta", () => {
  it("logged-out → login intent", () => {
    expect(resolvePricingCta({ isAuthenticated: false, tier: "pro", currentTier: null }).kind).toBe(
      "login",
    );
  });
  it("logged-in on a lower tier → upgrade", () => {
    expect(
      resolvePricingCta({ isAuthenticated: true, tier: "pro", currentTier: "free" }).kind,
    ).toBe("upgrade");
  });
  it("current tier → current", () => {
    expect(resolvePricingCta({ isAuthenticated: true, tier: "pro", currentTier: "pro" }).kind).toBe(
      "current",
    );
  });
});

describe("resolvePrimaryTier", () => {
  const plans = [
    { tier: "free", rank: 0, unitAmount: 0 },
    { tier: "pro", rank: 1, unitAmount: 1200 },
    { tier: "business", rank: 2, unitAmount: 4900 },
  ] as const;

  it("given a visitor, when pricing renders, then the lowest paid plan leads", () => {
    expect(resolvePrimaryTier(plans, null)).toBe("pro");
  });

  it("given a free org, when pricing renders, then the next plan leads", () => {
    expect(resolvePrimaryTier(plans, "free")).toBe("pro");
  });

  it("given a pro org, when pricing renders, then the plan above leads", () => {
    expect(resolvePrimaryTier(plans, "pro")).toBe("business");
  });

  it("given the top plan, when pricing renders, then no plan leads", () => {
    expect(resolvePrimaryTier(plans, "business")).toBeNull();
  });
});
