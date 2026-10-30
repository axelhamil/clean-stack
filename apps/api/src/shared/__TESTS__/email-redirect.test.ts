import { describe, expect, it } from "bun:test";
import { redirectQuery } from "../auth/email-redirect";

const authUrl = (callback: string) =>
  `https://api.test/api/auth/verify-email?token=t&callbackURL=${encodeURIComponent(callback)}`;

describe("redirectQuery", () => {
  it("carries a same-origin path to the app link", () => {
    expect(redirectQuery(authUrl("/accept-invitation/inv_1"))).toBe(
      "&redirect=%2Faccept-invitation%2Finv_1",
    );
  });

  it.each([
    "/",
    "https://evil.example/x",
    "//evil.example",
    "/\\evil.example",
    "/a/..//evil.example",
    "/x/../\\evil.example",
    "evil.example",
  ])("adds nothing for %j", (callback) => {
    expect(redirectQuery(authUrl(callback))).toBe("");
  });

  it("adds nothing when the link has no callback", () => {
    expect(redirectQuery("https://api.test/api/auth/verify-email?token=t")).toBe("");
  });
});
