import { describe, expect, it } from "vitest";
import { httpStatusFromCode } from "../application/error-code";

describe("httpStatusFromCode", () => {
  it("resolves BILLING_PAYMENT_REQUIRED to 402, not 401 (shadowing regression)", () => {
    expect(httpStatusFromCode("BILLING_PAYMENT_REQUIRED")).toBe(402);
  });

  it("resolves a plain _REQUIRED suffix to 401", () => {
    expect(httpStatusFromCode("SOMETHING_REQUIRED")).toBe(401);
  });

  it("resolves POLICY_ACCEPTANCE_REQUIRED to 409, not 401 (shadowing regression)", () => {
    expect(httpStatusFromCode("POLICY_ACCEPTANCE_REQUIRED")).toBe(409);
  });

  it("resolves _NOT_FOUND to 404", () => {
    expect(httpStatusFromCode("X_NOT_FOUND")).toBe(404);
  });
});
