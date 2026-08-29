import enCatalog from "@packages/i18n/src/catalogs/en";
import { describe, expect, it } from "vitest";
import { formatApiError } from "../messages";

const t = ((key: string, opts?: { defaultValue?: string }) => {
  const path = key.replace(/^errors:/, "").split(".");
  let node: unknown = enCatalog.errors;
  for (const seg of path) {
    if (typeof node !== "object" || node === null) return opts?.defaultValue ?? key;
    node = (node as Record<string, unknown>)[seg];
  }
  return typeof node === "string" ? node : (opts?.defaultValue ?? key);
}) as never;

describe("formatApiError", () => {
  it("prefers an exact code over a suffix", () => {
    expect(formatApiError({ code: "ACCOUNT_PASSWORD_INVALID" }, "fb", t)).toBe("Invalid password.");
  });

  it("falls back to the suffix table", () => {
    expect(formatApiError({ code: "WEBHOOK_NOT_FOUND" }, "fb", t)).toBe("Not found.");
  });

  it("matches the longest suffix, not the first", () => {
    expect(formatApiError({ code: "AUDIT_INTEGRITY_FAILED" }, "fb", t)).toBe(
      "Data integrity check failed. Please try again.",
    );
  });

  it("returns the caller fallback for an unknown code", () => {
    expect(formatApiError({ code: "SOMETHING_WEIRD" }, "fb", t)).toBe("fb");
  });

  it("returns the caller fallback for a non-object error", () => {
    expect(formatApiError(new Error("boom"), "fb", t)).toBe("fb");
  });
});
