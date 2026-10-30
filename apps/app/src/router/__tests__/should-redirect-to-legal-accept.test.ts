import { describe, expect, it } from "vitest";
import { shouldRedirectToLegalAccept } from "../should-redirect-to-legal-accept";

const stale = { tos: { current: false } };
const current = { tos: { current: true } };
const impersonating = { session: { impersonatedBy: "admin-1" } };
const notImpersonating = { session: { impersonatedBy: null } };

describe("shouldRedirectToLegalAccept", () => {
  it("returns true when policies are stale and user is not impersonating", () => {
    expect(shouldRedirectToLegalAccept(null, stale)).toBe(true);
  });

  it("returns true when session has no impersonation marker and policies are stale", () => {
    expect(shouldRedirectToLegalAccept(notImpersonating, stale)).toBe(true);
  });

  it("returns false when impersonating, even if policies are stale", () => {
    expect(shouldRedirectToLegalAccept(impersonating, stale)).toBe(false);
  });

  it("returns false when policies are all current", () => {
    expect(shouldRedirectToLegalAccept(null, current)).toBe(false);
  });

  it("returns true when policies could not be loaded, so nobody is admitted unchecked", () => {
    expect(shouldRedirectToLegalAccept(null, null)).toBe(true);
    expect(shouldRedirectToLegalAccept(notImpersonating, undefined)).toBe(true);
  });

  it("returns false when impersonating and policies could not be loaded", () => {
    expect(shouldRedirectToLegalAccept(impersonating, null)).toBe(false);
  });

  it("returns false when impersonating and policies are current", () => {
    expect(shouldRedirectToLegalAccept(impersonating, current)).toBe(false);
  });
});
