import { describe, expect, it } from "bun:test";
import { AppErrorException } from "@packages/ddd-kit";
import { ENTITLEMENTS } from "../../../modules/billing/config";
import { assertFeature, assertPlan, assertSeat } from "../billing.middleware";

const proView = { tier: "pro" as const, status: "active", ...ENTITLEMENTS.pro };

function captureCode(fn: () => void): string | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof AppErrorException) return err.code;
  }
}

describe("billing gate assertions", () => {
  it("assertFeature throws BILLING_PAYMENT_REQUIRED when the feature is absent", () => {
    expect(() => assertFeature(proView, "sso")).toThrow();
    expect(captureCode(() => assertFeature(proView, "sso"))).toBe("BILLING_PAYMENT_REQUIRED");
    expect(assertFeature(proView, "audit_log")).toBeUndefined();
  });
  it("assertPlan throws BILLING_PAYMENT_REQUIRED when below the min tier", () => {
    expect(() => assertPlan(proView, "business")).toThrow();
    expect(captureCode(() => assertPlan(proView, "business"))).toBe("BILLING_PAYMENT_REQUIRED");
    expect(assertPlan(proView, "pro")).toBeUndefined();
  });
  it("assertSeat throws BILLING_PAYMENT_REQUIRED when the cap is reached", () => {
    expect(() => assertSeat(3, ENTITLEMENTS.free.maxMembers)).toThrow();
    expect(captureCode(() => assertSeat(3, ENTITLEMENTS.free.maxMembers))).toBe(
      "BILLING_PAYMENT_REQUIRED",
    );
    expect(assertSeat(2, ENTITLEMENTS.free.maxMembers)).toBeUndefined();
  });
});
