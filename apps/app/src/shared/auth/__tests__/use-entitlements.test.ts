import { describe, expect, it } from "vitest";
import { buildEntitlementsView } from "../use-entitlements";

const proData = {
  tier: "pro" as const,
  status: "active",
  rank: 1,
  features: ["audit_log", "api"] as const,
  maxMembers: 20,
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
