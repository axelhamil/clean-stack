import {
  effectivePermissions,
  type StaffPermission,
  type StaffRole,
} from "@packages/access-control";
import { Option } from "@packages/ddd-kit";
import type { StaffRecord } from "./ports/staff-store.port";

export interface StaffEnv {
  PLATFORM_ADMIN_IDS: readonly string[];
  PLATFORM_ADMIN_REQUIRE_MFA: boolean;
}

export interface StaffAccess {
  role: StaffRole;
  permissions: StaffPermission[];
  mfaOk: boolean;
}

export interface StaffUser {
  id: string;
  twoFactorEnabled?: boolean | null;
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
    .filter((row) => row.source !== "env")
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
