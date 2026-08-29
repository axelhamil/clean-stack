import { describe, expect, it } from "vitest";
import { redirectToSsoIfRequired, resolveAuthError } from "./auth-error";

const t = ((key: string) => key) as never;
const tErrors = ((key: string, opts?: { defaultValue?: string }) => {
  if (key === "bySuffix.RATE_LIMITED") return "Too many requests. Please wait a moment.";
  return opts?.defaultValue ?? key;
}) as never;

describe("resolveAuthError", () => {
  it("returns the rate-limit copy when status is 429", () => {
    expect(resolveAuthError({ status: 429, message: "Too many" }, "fallback", t, tErrors)).toBe(
      "Too many requests. Please wait a moment.",
    );
  });

  it("returns the mapped code copy when the error carries a known code", () => {
    const withDefault = ((key: string, opts?: { defaultValue?: string }) => {
      if (key === "byCode.ACCOUNT_PASSWORD_INVALID") return "Invalid password.";
      return opts?.defaultValue ?? key;
    }) as never;
    expect(
      resolveAuthError(
        { status: 401, code: "ACCOUNT_PASSWORD_INVALID" },
        "fallback",
        t,
        withDefault,
      ),
    ).toBe("Invalid password.");
  });

  it("returns the caller fallback key translation when message and code are absent", () => {
    expect(resolveAuthError({ status: 500 }, "fallback message", t, tErrors)).toBe(
      "fallback message",
    );
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
