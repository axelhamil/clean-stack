import { describe, expect, it } from "bun:test";
import { AppErrorException } from "@packages/ddd-kit";
import { assertQuota } from "../middleware/billing.middleware";

describe("assertQuota", () => {
  it("passes below the cap", () => {
    expect(() => assertQuota(9, 10)).not.toThrow();
  });

  it("passes when unlimited (null)", () => {
    expect(() => assertQuota(9999, null)).not.toThrow();
  });

  it("throws BILLING_QUOTA_EXCEEDED at or over the cap", () => {
    try {
      assertQuota(10, 10);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AppErrorException);
      expect((err as AppErrorException).code).toBe("BILLING_QUOTA_EXCEEDED");
    }
  });
});
