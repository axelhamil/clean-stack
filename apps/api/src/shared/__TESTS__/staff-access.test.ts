import { describe, expect, it } from "bun:test";
import { permissionsOfRole } from "@packages/access-control";
import { Option } from "@packages/ddd-kit";
import type { StaffRecord, StaffSource } from "../ports/staff-store.port";
import { grantsStaffAccess, isLastManager, staffAccessOf } from "../staff-access";

const NOW = new Date("2026-10-30T12:00:00Z");

function row(source: StaffSource = "console", overrides: StaffRecord["overrides"] = []) {
  return Option.some<StaffRecord>({
    userId: "u",
    role: "support",
    source,
    banned: false,
    overrides,
  });
}

function env(ids: string[], requireMfa: boolean) {
  return { PLATFORM_ADMIN_IDS: ids, PLATFORM_ADMIN_REQUIRE_MFA: requireMfa };
}

const noRow = Option.none<StaffRecord>();
const withMfa = { id: "u", twoFactorEnabled: true };
const withoutMfa = { id: "u", twoFactorEnabled: false };

describe("grantsStaffAccess", () => {
  const listed = { PLATFORM_ADMIN_IDS: ["op"] };

  it("grants for a row that does not come from the env", () => {
    expect(grantsStaffAccess({ userId: "u", source: "console" }, listed)).toBe(true);
    expect(grantsStaffAccess({ userId: "u", source: "migration" }, listed)).toBe(true);
  });

  it("grants for an env row only while the id stays listed", () => {
    expect(grantsStaffAccess({ userId: "op", source: "env" }, listed)).toBe(true);
    expect(grantsStaffAccess({ userId: "u", source: "env" }, listed)).toBe(false);
  });
});

describe("isLastManager", () => {
  const none = { PLATFORM_ADMIN_IDS: [] };

  it("is true when nobody else counts", () => {
    expect(isLastManager("t", [{ userId: "t", source: "console" }], none)).toBe(true);
    expect(isLastManager("t", [], none)).toBe(true);
  });

  it("is false when another manager grants access", () => {
    expect(isLastManager("t", [{ userId: "o", source: "console" }], none)).toBe(false);
  });

  it("does not count another manager whose env listing is gone", () => {
    expect(isLastManager("t", [{ userId: "o", source: "env" }], none)).toBe(true);
  });
});

describe("staffAccessOf", () => {
  it("refuses a plain user with no row and no listing", () => {
    expect(staffAccessOf(withMfa, noRow, env([], true), NOW).isNone()).toBe(true);
  });

  it("does not read the auth role: a mirror admin with no row stays refused", () => {
    const user = { ...withMfa, role: "admin" };

    expect(staffAccessOf(user, noRow, env([], false), NOW).isNone()).toBe(true);
  });

  it("resolves a listed id with no row to manager", () => {
    const access = staffAccessOf(withMfa, noRow, env(["u"], true), NOW).unwrap();

    expect(access.role).toBe("manager");
    expect(access.permissions).toEqual([...permissionsOfRole("manager")]);
  });

  it("resolves a listed id to manager whatever its row says", () => {
    const denied = row("console", [
      { permission: "staff.manage", effect: "deny", expiresAt: Option.none() },
    ]);
    const access = staffAccessOf(withMfa, denied, env(["u"], true), NOW).unwrap();

    expect(access.role).toBe("manager");
    expect(access.permissions).toContain("staff.manage");
  });

  it("gives a row its role bundle", () => {
    const access = staffAccessOf(withMfa, row(), env([], true), NOW).unwrap();

    expect(access.role).toBe("support");
    expect(access.permissions).toEqual([...permissionsOfRole("support")]);
  });

  it("applies a row's live overrides and drops its expired ones", () => {
    const access = staffAccessOf(
      withMfa,
      row("console", [
        {
          permission: "audit.read",
          effect: "grant",
          expiresAt: Option.some(new Date("2027-01-01")),
        },
        { permission: "ops.read", effect: "grant", expiresAt: Option.some(new Date("2026-01-01")) },
      ]),
      env([], true),
      NOW,
    ).unwrap();

    expect(access.permissions).toContain("audit.read");
    expect(access.permissions).not.toContain("ops.read");
  });

  it("cuts a row that came from the env once its id leaves the list", () => {
    expect(staffAccessOf(withMfa, row("env"), env([], true), NOW).isNone()).toBe(true);
  });

  for (const [label, user, requireMfa, expected] of [
    ["required and enrolled", withMfa, true, true],
    ["required and not enrolled", withoutMfa, true, false],
    ["not required and enrolled", withMfa, false, true],
    ["not required and not enrolled", withoutMfa, false, true],
  ] as const) {
    it(`reports mfaOk ${expected} for a row when MFA is ${label}`, () => {
      expect(staffAccessOf(user, row(), env([], requireMfa), NOW).unwrap().mfaOk).toBe(expected);
    });

    it(`reports mfaOk ${expected} for a listed id when MFA is ${label}`, () => {
      expect(staffAccessOf(user, noRow, env(["u"], requireMfa), NOW).unwrap().mfaOk).toBe(expected);
    });
  }
});
