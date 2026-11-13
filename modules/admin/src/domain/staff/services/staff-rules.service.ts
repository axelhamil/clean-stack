import { permissionsOfRole, type StaffPermission, type StaffRole } from "@packages/access-control";
import { type AppError, Result } from "@packages/ddd-kit";
import {
  IMPERSONATE_PERMISSION,
  permissionsOfRecord,
  type StaffGrant,
  type StaffListing,
} from "./staff-access.service";

export const MANAGE_STAFF_PERMISSION: StaffPermission = "staff.manage";

export type SelfChangeForbidden = AppError<"ADMIN_STAFF_SELF_CHANGE_FORBIDDEN">;
export type ListedForbidden = AppError<"ADMIN_STAFF_LISTED_FORBIDDEN">;
export type GrantNotHeld = AppError<"ADMIN_STAFF_GRANT_NOT_HELD_FORBIDDEN">;
export type StaffTargetForbidden = AppError<"ADMIN_USER_STAFF_TARGET_FORBIDDEN">;

export interface StaffChange {
  actorUserId: string;
  targetUserId: string;
}

export interface OverrideGrant {
  actorPermissions: readonly StaffPermission[];
  permission: StaffPermission;
  effect: "grant" | "deny";
  liftsOverride: boolean;
}

export function staffNotFound(): AppError<"ADMIN_STAFF_NOT_FOUND"> {
  return { code: "ADMIN_STAFF_NOT_FOUND", message: "Not a staff member." };
}

export function grantNotHeld(): GrantNotHeld {
  return {
    code: "ADMIN_STAFF_GRANT_NOT_HELD_FORBIDDEN",
    message: "Nobody gives a permission they do not hold themselves.",
  };
}

export function overrideNotFound(): AppError<"ADMIN_STAFF_OVERRIDE_NOT_FOUND"> {
  return {
    code: "ADMIN_STAFF_OVERRIDE_NOT_FOUND",
    message: "This permission change no longer exists.",
  };
}

export function lastManager(): AppError<"ADMIN_STAFF_LAST_MANAGER_FORBIDDEN"> {
  return {
    code: "ADMIN_STAFF_LAST_MANAGER_FORBIDDEN",
    message: "The last manager cannot lose access.",
  };
}

export function isListed(userId: string, env: StaffListing): boolean {
  return env.PLATFORM_ADMIN_IDS.includes(userId);
}

export function changeRefusal(
  change: StaffChange,
  env: StaffListing,
): Result<void, SelfChangeForbidden | ListedForbidden> {
  if (change.actorUserId === change.targetUserId) {
    return Result.fail({
      code: "ADMIN_STAFF_SELF_CHANGE_FORBIDDEN",
      message: "Nobody changes their own access.",
    });
  }

  if (isListed(change.targetUserId, env)) {
    return Result.fail({
      code: "ADMIN_STAFF_LISTED_FORBIDDEN",
      message: "This access comes from PLATFORM_ADMIN_IDS and changes there.",
    });
  }

  return Result.ok();
}

export function roleGrantRefusal(
  role: StaffRole,
  actorPermissions: readonly StaffPermission[],
): Result<void, GrantNotHeld> {
  const beyond = permissionsOfRole(role).some(
    (permission) => !actorPermissions.includes(permission),
  );

  return beyond ? Result.fail(grantNotHeld()) : Result.ok();
}

export function overrideGrantRefusal(input: OverrideGrant): Result<void, GrantNotHeld> {
  const gives = input.liftsOverride ? input.effect === "deny" : input.effect === "grant";

  return gives && !input.actorPermissions.includes(input.permission)
    ? Result.fail(grantNotHeld())
    : Result.ok();
}

export function moderationRefusal(
  targetIsStaff: boolean,
  actorPermissions: readonly StaffPermission[],
): Result<void, StaffTargetForbidden> {
  if (targetIsStaff && !actorPermissions.includes(MANAGE_STAFF_PERMISSION)) {
    return Result.fail({
      code: "ADMIN_USER_STAFF_TARGET_FORBIDDEN",
      message: "Only someone who manages the staff can act on a staff member.",
    });
  }

  return Result.ok();
}

export function canImpersonate(row: StaffGrant, now: Date): boolean {
  return permissionsOfRecord(row, now).includes(IMPERSONATE_PERMISSION);
}

export function deniesOwnManagement(
  row: StaffGrant,
  override: { permission: StaffPermission; effect: "grant" | "deny" },
  now: Date,
): boolean {
  return (
    override.effect === "deny" &&
    override.permission === MANAGE_STAFF_PERMISSION &&
    row.role === "manager" &&
    permissionsOfRecord(row, now).includes(MANAGE_STAFF_PERMISSION)
  );
}
