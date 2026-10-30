import { describe, expect, it } from "vitest";
import {
  effectivePermissions,
  permissionsOfRole,
  STAFF_PERMISSIONS,
  STAFF_ROLES,
  type StaffPermission,
  type StaffRole,
} from "../staff";

const MATRIX: Record<StaffRole, readonly StaffPermission[]> = {
  manager: STAFF_PERMISSIONS,
  support: ["users.read", "users.moderate", "users.impersonate", "orgs.read"],
  auditor: ["users.read", "orgs.read", "audit.read", "ops.read"],
};

const NOW = new Date("2026-10-30T12:00:00Z");
const PAST = new Date("2026-10-30T11:59:59Z");
const FUTURE = new Date("2026-10-30T12:00:01Z");

describe("permissionsOfRole", () => {
  for (const role of STAFF_ROLES) {
    for (const permission of STAFF_PERMISSIONS) {
      const expected = MATRIX[role].includes(permission);

      it(`${role} ${expected ? "holds" : "lacks"} ${permission}`, () => {
        expect(permissionsOfRole(role).includes(permission)).toBe(expected);
      });
    }
  }
});

describe("effectivePermissions", () => {
  it("is the role bundle when there is no override", () => {
    expect(effectivePermissions("support", [], NOW)).toEqual([...MATRIX.support]);
  });

  it("adds an unexpired grant", () => {
    const granted = effectivePermissions(
      "support",
      [{ permission: "audit.read", effect: "grant", expiresAt: FUTURE }],
      NOW,
    );

    expect(granted).toContain("audit.read");
  });

  it("ignores a grant whose expiry has passed", () => {
    const granted = effectivePermissions(
      "support",
      [{ permission: "audit.read", effect: "grant", expiresAt: PAST }],
      NOW,
    );

    expect(granted).not.toContain("audit.read");
  });

  it("treats an expiry equal to now as passed", () => {
    const granted = effectivePermissions(
      "support",
      [{ permission: "audit.read", effect: "grant", expiresAt: NOW }],
      NOW,
    );

    expect(granted).not.toContain("audit.read");
  });

  it("keeps a grant with no expiry", () => {
    const granted = effectivePermissions(
      "auditor",
      [{ permission: "users.moderate", effect: "grant", expiresAt: null }],
      NOW,
    );

    expect(granted).toContain("users.moderate");
  });

  it("removes a bundled permission on an unexpired deny", () => {
    const denied = effectivePermissions(
      "manager",
      [{ permission: "users.delete", effect: "deny", expiresAt: FUTURE }],
      NOW,
    );

    expect(denied).not.toContain("users.delete");
  });

  it("restores a bundled permission once the deny has expired", () => {
    const denied = effectivePermissions(
      "manager",
      [{ permission: "users.delete", effect: "deny", expiresAt: PAST }],
      NOW,
    );

    expect(denied).toContain("users.delete");
  });

  it("lets a deny win over a grant of the same permission", () => {
    const resolved = effectivePermissions(
      "support",
      [
        { permission: "audit.read", effect: "grant", expiresAt: null },
        { permission: "audit.read", effect: "deny", expiresAt: null },
      ],
      NOW,
    );

    expect(resolved).not.toContain("audit.read");
  });
});
