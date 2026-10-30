import { toSafeRedirect } from "@packages/web-kit/auth/safe-redirect";
import { describe, expect, it } from "vitest";
import { signInUrl } from "../sign-in-url";

describe("signInUrl", () => {
  it("builds a target the customer app's allowlist accepts back", () => {
    const returnTo = "https://admin.example.com/users?q=a&b=c#row";
    const url = new URL(signInUrl("https://app.example.com", returnTo));

    expect(url.origin + url.pathname).toBe("https://app.example.com/sign-in");
    expect(
      toSafeRedirect(url.searchParams.get("redirect") ?? "", "https://admin.example.com"),
    ).toBe(returnTo);
  });
});
