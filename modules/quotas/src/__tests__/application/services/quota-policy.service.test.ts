import { describe, expect, it } from "bun:test";
import {
  currentPeriodFor,
  hasQuotaRemaining,
  quotaExceededError,
} from "../../../application/services/quota-policy.service";

describe("hasQuotaRemaining", () => {
  it("is true below the cap and when unlimited", () => {
    expect(hasQuotaRemaining(9, 10)).toBe(true);
    expect(hasQuotaRemaining(10, 10)).toBe(false);
    expect(hasQuotaRemaining(9999, null)).toBe(true);
  });
});

describe("quotaExceededError", () => {
  it("given no key, when built, then it carries the quota code and the usage over the limit", () => {
    const error = quotaExceededError(10, 10);
    expect(error.code).toBe("BILLING_QUOTA_EXCEEDED");
    expect(error.message).toBe("Quota exceeded (10/10).");
  });

  it("given a key, when built, then the message names the quota", () => {
    expect(quotaExceededError(12, 10, "uploads").message).toBe(
      "Quota exceeded for uploads (12/10).",
    );
  });
});

describe("currentPeriodFor", () => {
  it("given a subscription window, when the period is read, then it is that window", () => {
    const start = new Date("2026-07-01T00:00:00Z");
    const end = new Date("2026-08-01T00:00:00Z");

    const period = currentPeriodFor({ periodStart: start, periodEnd: end });

    expect(period).toEqual({ start, end });
  });

  it("given no subscription period, when the period is read, then it is a lifetime window", () => {
    const period = currentPeriodFor({ periodStart: null, periodEnd: null });

    expect(period.start.getTime()).toBe(0);
    expect(period.end.getTime()).toBeGreaterThan(Date.now());
  });
});
