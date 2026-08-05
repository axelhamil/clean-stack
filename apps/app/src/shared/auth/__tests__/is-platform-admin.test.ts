import { describe, expect, it } from "vitest";
import { isPlatformAdmin } from "../is-platform-admin";

describe("isPlatformAdmin", () => {
  it("returns false for null", () => {
    expect(isPlatformAdmin(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isPlatformAdmin(undefined)).toBe(false);
  });

  it("returns false when user is absent", () => {
    expect(isPlatformAdmin({})).toBe(false);
  });

  it("returns false when isPlatformAdmin flag is false", () => {
    expect(isPlatformAdmin({ user: { isPlatformAdmin: false } })).toBe(false);
  });

  it("returns false when isPlatformAdmin flag is absent", () => {
    expect(isPlatformAdmin({ user: {} })).toBe(false);
  });

  it("returns true when isPlatformAdmin flag is true", () => {
    expect(isPlatformAdmin({ user: { isPlatformAdmin: true } })).toBe(true);
  });
});
