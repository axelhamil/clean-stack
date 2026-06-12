import { describe, expect, it } from "vitest";
import { RATE_LIMITED_MESSAGE } from "../../shared/api/errors/messages";
import { resolveAuthError } from "./auth-error";

describe("resolveAuthError", () => {
  it("returns RATE_LIMITED_MESSAGE when status is 429", () => {
    expect(resolveAuthError({ status: 429, message: "Too many" }, "fallback")).toBe(
      RATE_LIMITED_MESSAGE,
    );
  });

  it("returns error.message for non-429 status", () => {
    expect(resolveAuthError({ status: 401, message: "Unauthorized" }, "fallback")).toBe(
      "Unauthorized",
    );
  });

  it("returns fallback when message is absent and not 429", () => {
    expect(resolveAuthError({ status: 500 }, "fallback message")).toBe("fallback message");
  });
});
