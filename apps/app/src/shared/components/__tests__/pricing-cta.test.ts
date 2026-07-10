import { describe, expect, it } from "vitest";
import { resolvePricingCta } from "../pricing-table";

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
