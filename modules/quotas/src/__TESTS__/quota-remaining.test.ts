import { describe, expect, it } from "bun:test";
import { hasQuotaRemaining, quotaExceededError } from "../domain/quota-remaining";

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
