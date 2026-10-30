import { z } from "zod";

export const STAFF_ROLES = ["manager", "support", "auditor"] as const;

export const STAFF_PERMISSIONS = [
  "users.read",
  "users.moderate",
  "users.role",
  "users.delete",
  "users.impersonate",
  "orgs.read",
  "orgs.sso",
  "audit.read",
  "ops.read",
  "ops.manage",
  "billing.override",
  "approvals.decide",
  "staff.manage",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

export interface StaffPermissionOverride {
  permission: StaffPermission;
  effect: "grant" | "deny";
  expiresAt: Date | null;
}

const ROLE_PERMISSIONS: Record<StaffRole, readonly StaffPermission[]> = {
  manager: STAFF_PERMISSIONS,
  support: ["users.read", "users.moderate", "users.impersonate", "orgs.read"],
  auditor: ["users.read", "orgs.read", "audit.read", "ops.read"],
};

export const APPROVAL_ACTIONS = [
  "user.ban_permanent",
  "staff.role_change",
  "staff.revoke",
] as const;

export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export const APPROVAL_ACTION_PERMISSION: Record<ApprovalAction, StaffPermission> = {
  "user.ban_permanent": "users.moderate",
  "staff.role_change": "staff.manage",
  "staff.revoke": "staff.manage",
};

export function isApprovalAction(value: string): value is ApprovalAction {
  return APPROVAL_ACTIONS.some((action) => action === value);
}

export function rolesWithStaffPermission(permission: StaffPermission): StaffRole[] {
  return STAFF_ROLES.filter((role) => ROLE_PERMISSIONS[role].includes(permission));
}

export function isStaffRole(value: string): value is StaffRole {
  return STAFF_ROLES.some((role) => role === value);
}

export function isStaffPermission(value: string): value is StaffPermission {
  return STAFF_PERMISSIONS.some((permission) => permission === value);
}

export function permissionsOfRole(role: StaffRole): readonly StaffPermission[] {
  return ROLE_PERMISSIONS[role];
}

export function effectivePermissions(
  role: StaffRole,
  overrides: readonly StaffPermissionOverride[],
  now: Date,
): StaffPermission[] {
  const live = overrides.filter((o) => o.expiresAt === null || o.expiresAt > now);
  const denied = new Set(live.filter((o) => o.effect === "deny").map((o) => o.permission));
  const granted = new Set([
    ...permissionsOfRole(role),
    ...live.filter((o) => o.effect === "grant").map((o) => o.permission),
  ]);

  return STAFF_PERMISSIONS.filter((p) => granted.has(p) && !denied.has(p));
}

export const staffAccessSchema = z.object({
  role: z.enum(STAFF_ROLES),
  permissions: z.array(z.enum(STAFF_PERMISSIONS)),
  mfaOk: z.boolean(),
});

export type StaffAccess = z.infer<typeof staffAccessSchema>;

export function staffReachable(access: StaffAccess | null): boolean {
  return access?.mfaOk === true;
}

export function authorizeStaff(access: StaffAccess | null, permission: StaffPermission): boolean {
  return staffReachable(access) && access?.permissions.includes(permission) === true;
}
