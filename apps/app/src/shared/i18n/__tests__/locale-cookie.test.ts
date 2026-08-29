import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOCALE_COOKIE, readLocaleCookie, writeLocaleCookie } from "../locale-cookie";

describe("locale cookie", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { cookie: "" });
  });

  it("returns undefined when the cookie is absent", () => {
    expect(readLocaleCookie()).toBeUndefined();
  });

  it("reads the locale cookie among others", () => {
    (globalThis.document as { cookie: string }).cookie = `theme=dark; ${LOCALE_COOKIE}=fr; a=b`;
    expect(readLocaleCookie()).toBe("fr");
  });

  it("is not confused by a cookie whose name ends with the same characters", () => {
    (globalThis.document as { cookie: string }).cookie = "mylocale=de";
    expect(readLocaleCookie()).toBeUndefined();
  });

  it("writes a year-long, lax, path-root cookie", () => {
    writeLocaleCookie("fr");
    const written = (globalThis.document as { cookie: string }).cookie;
    expect(written).toContain(`${LOCALE_COOKIE}=fr`);
    expect(written).toContain("path=/");
    expect(written).toContain("SameSite=Lax");
    expect(written).toContain("max-age=31536000");
  });
});
