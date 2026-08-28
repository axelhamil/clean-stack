import { describe, expect, it } from "vitest";
import { RATE_LIMITED_MESSAGE } from "../../shared/api/errors/messages";
import { redirectToSsoIfRequired, resolveAuthError } from "./auth-error";

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

describe("redirectToSsoIfRequired", () => {
  it("returns false without touching the network for a non-SSO_REQUIRED error", async () => {
    await expect(redirectToSsoIfRequired({ status: 401, message: "Unauthorized" })).resolves.toBe(
      false,
    );
  });

  it("returns false when the rejection is SSO_REQUIRED but carries no providerId", async () => {
    await expect(redirectToSsoIfRequired({ message: "SSO_REQUIRED" })).resolves.toBe(false);
  });
});
