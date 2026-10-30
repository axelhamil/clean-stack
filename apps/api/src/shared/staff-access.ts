import {
  effectivePermissions,
  type StaffAccess,
  type StaffPermission,
} from "@packages/access-control";
import { Option } from "@packages/ddd-kit";
import type { StaffRecord, StaffSource } from "./ports/staff-store.port";

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
  managers: ReadonlyArray<{ userId: string; source: StaffSource }>,
  env: StaffListing,
): boolean {
  return !managers.some((m) => m.userId !== targetUserId && grantsStaffAccess(m, env));
}

export function staffAccessOf(
  user: StaffUser,
  staffRow: Option<StaffRecord>,
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
      permissions: effectivePermissions(
        row.role,
        row.overrides.map((o) => ({ ...o, expiresAt: o.expiresAt.toNull() })),
        now,
      ),
      mfaOk,
    }));
}
