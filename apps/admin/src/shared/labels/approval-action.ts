export const APPROVAL_ACTION_LABEL_KEYS = {
  "user.ban_permanent": "approvals.action.userBanPermanent",
  "staff.role_change": "approvals.action.staffRoleChange",
  "staff.revoke": "approvals.action.staffRevoke",
  "staff.permission_override": "approvals.action.staffPermissionOverride",
} as const;

export function approvalActionLabelKey(action: string) {
  const known = Object.entries(APPROVAL_ACTION_LABEL_KEYS).find(([key]) => key === action);

  return known ? known[1] : null;
}
