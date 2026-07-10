import { describe, expect, it } from "vitest";
import { buildEntitlementsView } from "../use-entitlements";

const proData = {
  tier: "pro" as const,
  status: "active",
  rank: 1,
  features: ["audit_log", "api"] as const,
  maxMembers: 20,
  quotas: {} as Record<string, number | null>,
};

describe("buildEntitlementsView", () => {
  it("exposes hasFeature / atLeast / seat helpers", () => {
    const v = buildEntitlementsView(proData);
    expect(v.hasFeature("audit_log")).toBe(true);
    expect(v.hasFeature("sso")).toBe(false);
    expect(v.atLeast("pro")).toBe(true);
    expect(v.atLeast("business")).toBe(false);
    expect(v.seatsRemaining(18)).toBe(2);
    expect(v.canInviteMember(20)).toBe(false);
    expect(v.canInviteMember(19)).toBe(true);
  });

  it("treats maxMembers === null as unlimited", () => {
    const v = buildEntitlementsView({
      tier: "business",
      status: "active",
      rank: 2,
      features: ["audit_log", "api", "sso"],
      maxMembers: null,
      quotas: {},
    });
    expect(v.canInviteMember(9999)).toBe(true);
    expect(v.seatsRemaining(100)).toBeNull();
  });

  it("defaults to a free view when data is undefined", () => {
    const v = buildEntitlementsView(undefined);
    expect(v.tier).toBe("free");
    expect(v.atLeast("pro")).toBe(false);
  });
});

describe("buildEntitlementsView — quotas", () => {
  it("exposes useQuota with remaining and exceeded", () => {
    const view = buildEntitlementsView({
      tier: "free",
      status: "free",
      rank: 0,
      features: [],
      maxMembers: 3,
      quotas: { uploads: 10 },
    });
    expect(view.useQuota("uploads", 4)).toEqual({
      limit: 10,
      used: 4,
      remaining: 6,
      exceeded: false,
    });
    expect(view.useQuota("uploads", 10).exceeded).toBe(true);
  });

  it("treats an unknown / unlimited quota as no cap", () => {
    const view = buildEntitlementsView({
      tier: "business",
      status: "active",
      rank: 2,
      features: [],
      maxMembers: null,
      quotas: { uploads: null },
    });
    expect(view.useQuota("uploads", 9999)).toEqual({
      limit: null,
      used: 9999,
      remaining: null,
      exceeded: false,
    });
  });
});
