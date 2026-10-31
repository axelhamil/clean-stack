import type { StaffPermission, StaffRole } from "@packages/access-control";

export const STAFF_ROLE_LABEL_KEYS = {
  manager: "team.role.manager",
  support: "team.role.support",
  auditor: "team.role.auditor",
} as const satisfies Record<StaffRole, string>;

export const STAFF_PERMISSION_LABEL_KEYS = {
  "users.read": "team.permissions.name.usersRead",
  "users.moderate": "team.permissions.name.usersModerate",
  "users.role": "team.permissions.name.usersRole",
  "users.delete": "team.permissions.name.usersDelete",
  "users.impersonate": "team.permissions.name.usersImpersonate",
  "orgs.read": "team.permissions.name.orgsRead",
  "orgs.sso": "team.permissions.name.orgsSso",
  "audit.read": "team.permissions.name.auditRead",
  "ops.read": "team.permissions.name.opsRead",
  "ops.manage": "team.permissions.name.opsManage",
  "billing.override": "team.permissions.name.billingOverride",
  "approvals.decide": "team.permissions.name.approvalsDecide",
  "staff.manage": "team.permissions.name.staffManage",
} as const satisfies Record<StaffPermission, string>;
