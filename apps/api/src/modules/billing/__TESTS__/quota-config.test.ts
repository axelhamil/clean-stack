import { describe, expect, it } from "bun:test";
import type { EntitlementsView } from "../config";
import { ENTITLEMENTS, hasQuotaRemaining, quotaLimit } from "../config";

const freeView: EntitlementsView = { ...ENTITLEMENTS.free, tier: "free", status: "free" };
const proView: EntitlementsView = { ...ENTITLEMENTS.pro, tier: "pro", status: "active" };
const businessView: EntitlementsView = {
  ...ENTITLEMENTS.business,
  tier: "business",
  status: "active",
};

describe("quota catalog", () => {
  it("reads a numeric quota for a tier", () => {
    expect(quotaLimit(freeView, "uploads")).toBe(10);
    expect(quotaLimit(freeView, "projects")).toBe(3);
    expect(quotaLimit(freeView, "apiCallsPerMonth")).toBe(1_000);
  });

  it("reads the pro tier quotas", () => {
    expect(quotaLimit(proView, "uploads")).toBe(100);
    expect(quotaLimit(proView, "projects")).toBe(20);
    expect(quotaLimit(proView, "apiCallsPerMonth")).toBe(50_000);
  });

  it("returns null (unlimited) for the business tier", () => {
    expect(quotaLimit(businessView, "uploads")).toBeNull();
    expect(quotaLimit(businessView, "apiCallsPerMonth")).toBeNull();
  });

  it("hasQuotaRemaining is true below the cap and when unlimited", () => {
    expect(hasQuotaRemaining(9, 10)).toBe(true);
    expect(hasQuotaRemaining(10, 10)).toBe(false);
    expect(hasQuotaRemaining(9999, null)).toBe(true);
  });
});
