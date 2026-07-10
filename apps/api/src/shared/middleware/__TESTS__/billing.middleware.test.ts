import { describe, expect, it } from "bun:test";
import { ENTITLEMENTS } from "../../../modules/billing/config";
import { assertFeature, assertPlan, assertSeat } from "../billing.middleware";

const proView = { tier: "pro" as const, status: "active", ...ENTITLEMENTS.pro };

describe("billing gate assertions", () => {
  it("assertFeature throws 402 when the feature is absent", () => {
    expect(() => assertFeature(proView, "sso")).toThrow();
    expect(assertFeature(proView, "audit_log")).toBeUndefined();
  });
  it("assertPlan throws when below the min tier", () => {
    expect(() => assertPlan(proView, "business")).toThrow();
    expect(assertPlan(proView, "pro")).toBeUndefined();
  });
  it("assertSeat throws when the cap is reached", () => {
    expect(() => assertSeat(3, ENTITLEMENTS.free.maxMembers)).toThrow();
    expect(assertSeat(2, ENTITLEMENTS.free.maxMembers)).toBeUndefined();
  });
});
