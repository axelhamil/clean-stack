import { describe, expect, it } from "bun:test";
import type { EntitlementsView } from "../config";
import { ENTITLEMENTS, hasQuotaRemaining, quotaLimit } from "../config";

const freeView: EntitlementsView = { ...ENTITLEMENTS.free, tier: "free", status: "free" };
const businessView: EntitlementsView = {
  ...ENTITLEMENTS.business,
  tier: "business",
  status: "active",
};

describe("quota catalog", () => {
  it("reads a numeric quota for a tier", () => {
    expect(quotaLimit(freeView, "uploads")).toBe(10);
    expect(quotaLimit(freeView, "projects")).toBe(3);
  });

  it("returns null (unlimited) for the business tier", () => {
    expect(quotaLimit(businessView, "uploads")).toBeNull();
  });

  it("hasQuotaRemaining is true below the cap and when unlimited", () => {
    expect(hasQuotaRemaining(9, 10)).toBe(true);
    expect(hasQuotaRemaining(10, 10)).toBe(false);
    expect(hasQuotaRemaining(9999, null)).toBe(true);
  });
});
