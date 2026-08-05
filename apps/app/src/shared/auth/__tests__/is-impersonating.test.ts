import { describe, expect, it } from "vitest";
import { isImpersonating } from "../is-impersonating";

describe("isImpersonating", () => {
  it("returns false for a null session", () => {
    expect(isImpersonating(null)).toBe(false);
  });

  it("returns false when the session field is absent", () => {
    expect(isImpersonating({})).toBe(false);
  });

  it("returns false when impersonatedBy is null", () => {
    expect(isImpersonating({ session: { impersonatedBy: null } })).toBe(false);
  });

  it("returns false when impersonatedBy is absent", () => {
    expect(isImpersonating({ session: {} })).toBe(false);
  });

  it("returns true when impersonatedBy holds an admin id", () => {
    expect(isImpersonating({ session: { impersonatedBy: "admin-1" } })).toBe(true);
  });
});
