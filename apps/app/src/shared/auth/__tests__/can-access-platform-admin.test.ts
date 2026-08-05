import { describe, expect, it } from "vitest";
import { canAccessPlatformAdmin } from "../can-access-platform-admin";

describe("canAccessPlatformAdmin", () => {
  it("returns false for null", () => {
    expect(canAccessPlatformAdmin(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(canAccessPlatformAdmin(undefined)).toBe(false);
  });

  it("returns false when user is absent", () => {
    expect(canAccessPlatformAdmin({})).toBe(false);
  });

  it("returns false when isPlatformAdmin is true but twoFactorEnabled is false", () => {
    expect(
      canAccessPlatformAdmin({ user: { isPlatformAdmin: true, twoFactorEnabled: false } }),
    ).toBe(false);
  });

  it("returns false when isPlatformAdmin is true but twoFactorEnabled is absent", () => {
    expect(canAccessPlatformAdmin({ user: { isPlatformAdmin: true } })).toBe(false);
  });

  it("returns false when isPlatformAdmin is false even if twoFactorEnabled is true", () => {
    expect(
      canAccessPlatformAdmin({ user: { isPlatformAdmin: false, twoFactorEnabled: true } }),
    ).toBe(false);
  });

  it("returns true only when isPlatformAdmin is true and twoFactorEnabled is true", () => {
    expect(
      canAccessPlatformAdmin({ user: { isPlatformAdmin: true, twoFactorEnabled: true } }),
    ).toBe(true);
  });
});
