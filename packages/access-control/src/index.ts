import type { AccessControl } from "better-auth/plugins/access";
import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

const statement = {
  ...defaultStatements,
  organization: ["update", "delete", "leave"],
  billing: ["read", "manage"],
  auditLog: ["read"],
  webhooks: ["read", "write"],
} as const;

const _ac = createAccessControl(statement);

const _owner = _ac.newRole({
  ...ownerAc.statements,
  organization: ["update", "delete", "leave"],
  billing: ["read", "manage"],
  auditLog: ["read"],
  webhooks: ["read", "write"],
});

const _admin = _ac.newRole({
  ...adminAc.statements,
  organization: ["update", "leave"],
  billing: ["read"],
  auditLog: ["read"],
  webhooks: ["read", "write"],
});

const _member = _ac.newRole({
  ...memberAc.statements,
  organization: ["leave"],
});

const _orgRoles = ["owner", "admin", "member"] as const;
type _OrgRole = (typeof _orgRoles)[number];

const _roles = { owner: _owner, admin: _admin, member: _member } as const satisfies Record<
  _OrgRole,
  unknown
>;

export const ORG_ROLES = _orgRoles;
export const STATEMENTS = statement;

export type OrgRole = _OrgRole;
export type OrgPermissions = {
  [K in keyof typeof statement]?: readonly (typeof statement)[K][number][];
};

export function authorizeRole(
  role: OrgRole | undefined,
  permissions: OrgPermissions,
  connector: "OR" | "AND" = "AND",
): boolean {
  if (!role) return false;
  const policy = _roles[role] as {
    authorize: (p: OrgPermissions, c?: "OR" | "AND") => { success: boolean };
  };
  return policy.authorize(permissions, connector).success;
}

export const ac = _ac as unknown as AccessControl;
export const roles = _roles;

/**
 * The single allowed special-case from CLAUDE.md R5 (multi-tenant).
 *
 * Personal orgs are auto-created on signup, tied 1:1 to a user account.
 * Encoded by slug pattern (`personal-${uuid}`); the *check* lives here so
 * the rest of the codebase never branches on the discriminator directly.
 */
export function isPersonalOrg(slug: string): boolean {
  return slug.startsWith("personal-");
}
