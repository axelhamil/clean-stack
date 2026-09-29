import { describe, expect, it } from "bun:test";
import {
  ENTITLEMENTS,
  type EntitlementsView,
  entitlementsForTier,
  hasFeature,
  hasQuotaRemaining,
  hasSeatAvailable,
  isTier,
  meetsPlan,
  quotaLimit,
  rankOf,
} from "../entitlements";

describe("entitlements", () => {
  it("orders tiers free < pro < business", () => {
    expect(rankOf("free")).toBeLessThan(rankOf("pro"));
    expect(rankOf("pro")).toBeLessThan(rankOf("business"));
  });

  it("entitlementsForTier falls back to free on unknown tier", () => {
    expect(entitlementsForTier("garbage")).toEqual(ENTITLEMENTS.free);
    expect(entitlementsForTier("pro")).toEqual(ENTITLEMENTS.pro);
  });

  it("isTier rejects names inherited from Object.prototype", () => {
    expect(isTier("toString")).toBe(false);
    expect(isTier("constructor")).toBe(false);
    expect(entitlementsForTier("constructor")).toEqual(ENTITLEMENTS.free);
  });

  it("hasFeature reads the view's feature set", () => {
    const proView = { tier: "pro" as const, status: "active", ...ENTITLEMENTS.pro };
    expect(hasFeature(proView, "audit_log")).toBe(true);
    expect(hasFeature(proView, "sso")).toBe(false);
  });

  it("meetsPlan compares rank inclusively", () => {
    const proView = { tier: "pro" as const, status: "active", ...ENTITLEMENTS.pro };
    expect(meetsPlan(proView, "pro")).toBe(true);
    expect(meetsPlan(proView, "free")).toBe(true);
    expect(meetsPlan(proView, "business")).toBe(false);
  });

  it("hasSeatAvailable blocks at the cap, allows below, treats null as unlimited", () => {
    expect(hasSeatAvailable(2, 3)).toBe(true);
    expect(hasSeatAvailable(3, 3)).toBe(false);
    expect(hasSeatAvailable(0, null)).toBe(true);
    expect(hasSeatAvailable(5, null)).toBe(true);
  });
});

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
