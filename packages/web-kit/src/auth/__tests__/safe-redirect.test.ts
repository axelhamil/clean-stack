import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { redirectSearchSchema, toSafeRedirect, twoFactorPath } from "../safe-redirect";

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
    "/a/..//evil.example",
    "/.//evil.example",
    "/..//evil.example",
    "/x/../\\evil.example",
    "/./\\evil.example",
    "/%2f/evil.example",
    "/%5Cevil.example",
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

describe("toSafeRedirect on older browsers", () => {
  const nativeParse = URL.parse;

  beforeEach(() => {
    Reflect.deleteProperty(URL, "parse");
  });

  afterEach(() => {
    URL.parse = nativeParse;
  });

  it("keeps a safe path and rejects an off-site one without URL.parse", () => {
    expect(toSafeRedirect("/accept-invitation/inv_1")).toBe("/accept-invitation/inv_1");
    expect(toSafeRedirect("//evil.example")).toBeUndefined();
  });

  it("treats a value URL cannot parse as no redirect", () => {
    expect(toSafeRedirect("/\\")).toBeUndefined();
  });
});

describe("twoFactorPath", () => {
  it("carries a safe redirect from the sign-in page", () => {
    expect(twoFactorPath("?redirect=%2Faccept-invitation%2Finv_1")).toBe(
      "/two-factor?redirect=%2Faccept-invitation%2Finv_1",
    );
  });

  it.each(["", "?redirect=%2F%2Fevil.example", "?other=1"])(
    "drops anything else in %j",
    (search) => {
      expect(twoFactorPath(search)).toBe("/two-factor");
    },
  );
});
