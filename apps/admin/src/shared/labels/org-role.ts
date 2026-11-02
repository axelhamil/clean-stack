const ORG_ROLE_LABEL_KEYS = {
  owner: "common:roles.owner",
  admin: "common:roles.admin",
  member: "common:roles.member",
} as const;

export function orgRoleLabelKey(role: string) {
  if (role === "owner" || role === "admin" || role === "member") return ORG_ROLE_LABEL_KEYS[role];

  return null;
}
