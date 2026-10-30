import { describe, expect, it } from "vitest";
import { redirectSearchSchema, toSafeRedirect } from "../safe-redirect";

describe("toSafeRedirect", () => {
  it.each([
    "/dashboard",
    "/accept-invitation/inv_1",
    "/pricing?plan=pro",
    "/settings/billing?upgraded=1#plan",
  ])("keeps the same-origin path %s", (path) => {
    expect(toSafeRedirect(path)).toBe(path);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "javascript:alert(1)",
    "data:text/html,x",
    "evil.example",
    "",
  ])("rejects the off-site target %j", (target) => {
    expect(toSafeRedirect(target)).toBeUndefined();
  });

  it("treats an absent value as no redirect", () => {
    expect(toSafeRedirect(undefined)).toBeUndefined();
  });
});

describe("redirectSearchSchema", () => {
  it("drops an unsafe redirect instead of failing the page", () => {
    expect(
      redirectSearchSchema.parse({ redirect: "https://evil.example" }).redirect,
    ).toBeUndefined();
  });

  it("drops a value the router parsed into a non-string", () => {
    expect(redirectSearchSchema.parse({ redirect: 42 }).redirect).toBeUndefined();
  });

  it("keeps a safe redirect", () => {
    expect(redirectSearchSchema.parse({ redirect: "/accept-invitation/inv_1" }).redirect).toBe(
      "/accept-invitation/inv_1",
    );
  });
});
