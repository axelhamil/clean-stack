import { describe, expect, it } from "bun:test";
import {
  ENTITLEMENTS,
  entitlementsForTier,
  hasFeature,
  hasSeatAvailable,
  meetsPlan,
  rankOf,
} from "../config";

describe("billing config", () => {
  it("orders tiers free < pro < business", () => {
    expect(rankOf("free")).toBeLessThan(rankOf("pro"));
    expect(rankOf("pro")).toBeLessThan(rankOf("business"));
  });

  it("entitlementsForTier falls back to free on unknown tier", () => {
    expect(entitlementsForTier("garbage")).toEqual(ENTITLEMENTS.free);
    expect(entitlementsForTier("pro")).toEqual(ENTITLEMENTS.pro);
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
