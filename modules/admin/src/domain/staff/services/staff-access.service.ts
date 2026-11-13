import {
  effectivePermissions,
  type StaffAccess,
  type StaffPermission,
  type StaffRole,
} from "@packages/access-control";
import { Option } from "@packages/ddd-kit";

export type StaffSource = "env" | "console" | "migration";

export interface StaffOverrideGrant {
  permission: StaffPermission;
  effect: "grant" | "deny";
  expiresAt: Option<Date>;
}

export interface StaffGrant {
  userId: string;
  role: StaffRole;
  source: StaffSource;
  overrides: StaffOverrideGrant[];
}

export interface StaffEnv {
  PLATFORM_ADMIN_IDS: readonly string[];
  PLATFORM_ADMIN_REQUIRE_MFA: boolean;
}

export type StaffListing = Pick<StaffEnv, "PLATFORM_ADMIN_IDS">;

export interface StaffUser {
  id: string;
  twoFactorEnabled?: boolean | null;
}

export const IMPERSONATE_PERMISSION: StaffPermission = "users.impersonate";

export function grantsStaffAccess(
  row: { userId: string; source: StaffSource },
  env: StaffListing,
): boolean {
  return row.source !== "env" || env.PLATFORM_ADMIN_IDS.includes(row.userId);
}

export function isLastManager(
  targetUserId: string,
  managers: ReadonlyArray<{ userId: string; source: StaffSource; manageDenied?: boolean }>,
  env: StaffListing,
): boolean {
  const stillManages = (manager: { userId: string; manageDenied?: boolean }) =>
    manager.manageDenied !== true || env.PLATFORM_ADMIN_IDS.includes(manager.userId);

  return !managers.some(
    (m) => m.userId !== targetUserId && grantsStaffAccess(m, env) && stillManages(m),
  );
}

export function permissionsOfRecord(row: StaffGrant, now: Date): StaffPermission[] {
  return effectivePermissions(
    row.role,
    row.overrides.map((o) => ({ ...o, expiresAt: o.expiresAt.toNull() })),
    now,
  );
}

export function staffAccessOf(
  user: StaffUser,
  staffRow: Option<StaffGrant>,
  env: StaffEnv,
  now: Date = new Date(),
): Option<StaffAccess> {
  const mfaOk = !env.PLATFORM_ADMIN_REQUIRE_MFA || user.twoFactorEnabled === true;

  if (env.PLATFORM_ADMIN_IDS.includes(user.id)) {
    return Option.some({
      role: "manager",
      permissions: effectivePermissions("manager", [], now),
      mfaOk,
    });
  }

  return staffRow
    .filter((row) => grantsStaffAccess(row, env))
    .map((row) => ({
      role: row.role,
      permissions: permissionsOfRecord(row, now),
      mfaOk,
    }));
}
