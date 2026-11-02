import { REDIRECT_ADMIN_ORIGIN, REDIRECT_VECTORS } from "@packages/test/redirect-vectors";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createRedirectSearchSchema,
  isExternalRedirect,
  toSafeRedirect,
  twoFactorPath,
} from "../safe-redirect";

const ADMIN = "https://admin.example.com";
const redirectSearchSchema = createRedirectSearchSchema();

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

describe("toSafeRedirect with an allowed external origin", () => {
  it.each([
    [ADMIN, `${ADMIN}/`],
    [`${ADMIN}/`, `${ADMIN}/`],
    [`${ADMIN}/users?q=a#row`, `${ADMIN}/users?q=a#row`],
  ])("keeps %s", (target, expected) => {
    expect(toSafeRedirect(target, ADMIN)).toBe(expected);
  });

  it("still keeps a same-origin path", () => {
    expect(toSafeRedirect("/dashboard", ADMIN)).toBe("/dashboard");
  });

  it.each([
    ["a lookalike suffix", "https://admin.example.com.evil.example/"],
    ["a lookalike prefix", "https://evil-admin.example.com/"],
    ["userinfo hiding the real host", "https://admin.example.com@evil.example/"],
    ["userinfo on the real host", "https://user:pw@admin.example.com/"],
    ["a backslash before the real host", "https://evil.example\\@admin.example.com/"],
    ["a downgraded scheme", "http://admin.example.com/"],
    ["a script scheme", "javascript://admin.example.com/%0aalert(1)"],
    ["a data scheme", `data:text/html,${ADMIN}`],
    ["a schemeless host", "//admin.example.com/"],
    ["a scheme with one slash", "https:/admin.example.com/"],
    ["a tab inside the host", "https://admin\t.example.com/"],
    ["a newline before the host", "https://\nadmin.example.com/"],
    ["another port", "https://admin.example.com:8443/"],
    ["a protocol-relative path", `${ADMIN}//evil.example`],
    ["an encoded separator", `${ADMIN}/%2f/evil.example`],
  ])("rejects %s", (_label, target) => {
    expect(toSafeRedirect(target, ADMIN)).toBeUndefined();
  });

  it("rejects every absolute url when no external origin is allowed", () => {
    expect(toSafeRedirect(`${ADMIN}/`)).toBeUndefined();
  });

  it("allows nothing when the configured origin is not a url", () => {
    expect(toSafeRedirect("https://evil.example/", "not a url")).toBeUndefined();
  });
});

describe("createRedirectSearchSchema", () => {
  it("keeps the allowed origin and drops any other", () => {
    const schema = createRedirectSearchSchema(ADMIN);

    expect(schema.parse({ redirect: `${ADMIN}/users` }).redirect).toBe(`${ADMIN}/users`);
    expect(schema.parse({ redirect: "https://evil.example/" }).redirect).toBeUndefined();
  });
});

describe("isExternalRedirect", () => {
  it("tells an absolute target from a path", () => {
    expect(isExternalRedirect(`${ADMIN}/`)).toBe(true);
    expect(isExternalRedirect("/dashboard")).toBe(false);
  });
});

describe("twoFactorPath with an allowed external origin", () => {
  it("carries the external target through the code step", () => {
    const search = `?redirect=${encodeURIComponent(`${ADMIN}/users`)}`;

    expect(twoFactorPath(search, ADMIN)).toBe(
      `/two-factor?redirect=${encodeURIComponent(`${ADMIN}/users`)}`,
    );
    expect(twoFactorPath(search)).toBe("/two-factor");
  });
});

describe("the redirect allowlist shared with the API", () => {
  it.each(REDIRECT_VECTORS)("$target", ({ target, expected }) => {
    expect(toSafeRedirect(target, REDIRECT_ADMIN_ORIGIN)).toBe(expected);
  });
});
