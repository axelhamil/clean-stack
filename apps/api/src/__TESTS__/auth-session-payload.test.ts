import { describe, expect, it } from "bun:test";
import { buildSessionPayload } from "../auth-session-payload";

describe("buildSessionPayload", () => {
  it("exposes the impersonator id when the session is impersonated", () => {
    const payload = buildSessionPayload(
      { id: "u-1", role: "user", twoFactorEnabled: false },
      { id: "s-1", impersonatedBy: "admin-1", activeOrganizationId: null },
      null,
    );
    expect(payload.session.impersonatedBy).toBe("admin-1");
  });

  it("returns null for a regular session", () => {
    const payload = buildSessionPayload(
      { id: "u-1", role: "user", twoFactorEnabled: false },
      { id: "s-1", impersonatedBy: null, activeOrganizationId: null },
      null,
    );
    expect(payload.session.impersonatedBy).toBeNull();
  });

  it("normalises undefined impersonatedBy to null", () => {
    const payload = buildSessionPayload(
      { id: "u-1", role: "user", twoFactorEnabled: false },
      { id: "s-1", impersonatedBy: undefined, activeOrganizationId: null },
      null,
    );
    expect(payload.session.impersonatedBy).toBeNull();
  });

  it("exposes the staff access it is given, and never recomputes it from the role", () => {
    const staff = { role: "auditor" as const, permissions: ["audit.read" as const], mfaOk: true };
    const refused = buildSessionPayload(
      { id: "u-1", role: "admin" },
      { id: "s-1", impersonatedBy: null, activeOrganizationId: null },
      null,
    );
    const granted = buildSessionPayload(
      { id: "u-1", role: "user" },
      { id: "s-1", impersonatedBy: null, activeOrganizationId: null },
      staff,
    );

    expect(refused.staff).toBeNull();
    expect(granted.staff).toEqual(staff);
  });

  it("exposes the staff access it is given, and never recomputes it from the role", () => {
    const staff = { role: "auditor" as const, permissions: ["audit.read" as const], mfaOk: true };
    const refused = buildSessionPayload(
      { id: "u-1", role: "admin" },
      { id: "s-1", impersonatedBy: null, activeOrganizationId: null },
      null,
    );
    const granted = buildSessionPayload(
      { id: "u-1", role: "user" },
      { id: "s-1", impersonatedBy: null, activeOrganizationId: null },
      staff,
    );

    expect(refused.staff).toBeNull();
    expect(granted.staff).toEqual(staff);
  });
});
