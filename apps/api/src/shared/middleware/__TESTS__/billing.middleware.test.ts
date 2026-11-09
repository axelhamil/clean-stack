import { describe, expect, it } from "bun:test";
import { ENTITLEMENTS } from "@modules/billing/domain/entitlements";
import { AppErrorException } from "@packages/ddd-kit";
import { assertFeature, assertPlan } from "../billing.middleware";

const proView = {
  tier: "pro" as const,
  status: "active",
  hasSubscription: true,
  ...ENTITLEMENTS.pro,
};

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
});
