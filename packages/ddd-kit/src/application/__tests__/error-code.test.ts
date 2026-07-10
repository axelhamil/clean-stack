import { describe, expect, it } from "vitest";
import { httpStatusFromCode } from "../error-code";

describe("httpStatusFromCode — quota", () => {
  it("maps BILLING_QUOTA_EXCEEDED to 429", () => {
    expect(httpStatusFromCode("BILLING_QUOTA_EXCEEDED")).toBe(429);
  });

  it("does not let _REQUIRED shadow a longer suffix", () => {
    expect(httpStatusFromCode("BILLING_PAYMENT_REQUIRED")).toBe(402);
  });
});
