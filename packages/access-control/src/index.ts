import type { AccessControl } from "better-auth/plugins/access";
import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

const appStatement = {
  organization: ["update", "delete", "leave"],
  billing: ["read", "manage"],
  auditLog: ["read"],
  webhooks: ["read", "write"],
  apiToken: ["create", "read", "revoke"],
  scim: ["manage"],
} as const;

const statement = { ...defaultStatements, ...appStatement } as const;

const _ac = createAccessControl(statement);

const _owner = _ac.newRole({ ...ownerAc.statements, ...appStatement });

const _admin = _ac.newRole({
  ...adminAc.statements,
  organization: ["update", "leave"],
  billing: ["read"],
  auditLog: ["read"],
  webhooks: ["read", "write"],
  apiToken: ["create", "read", "revoke"],
});

const _member = _ac.newRole({
  ...memberAc.statements,
  organization: ["leave"],
});

export const ORG_ROLES = ["owner", "admin", "member"] as const;
export const STATEMENTS = statement;

export type OrgRole = (typeof ORG_ROLES)[number];
export type OrgPermissions = {
  [K in keyof typeof statement]?: readonly (typeof statement)[K][number][];
};

const _roles = { owner: _owner, admin: _admin, member: _member } as const satisfies Record<
  OrgRole,
  unknown
>;

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

export function rolesWith(permissions: OrgPermissions): OrgRole[] {
  return ORG_ROLES.filter((role) => authorizeRole(role, permissions));
}

export const ac = _ac as unknown as AccessControl;
export const roles = _roles;

/**
 * The single allowed special case of the org-scoping rules (apps/api/CLAUDE.md).
 *
 * Personal orgs are auto-created on signup, tied 1:1 to a user account.
 * Encoded by slug pattern (`personal-${uuid}`); the *check* lives here so
 * the rest of the codebase never branches on the discriminator directly.
 */
export const PERSONAL_ORG_SLUG_PREFIX = "personal-";
export const PERSONAL_ORG_SLUG_LIKE_PATTERN = `${PERSONAL_ORG_SLUG_PREFIX}%`;

export function isPersonalOrg(slug: string): boolean {
  return slug.startsWith(PERSONAL_ORG_SLUG_PREFIX);
}
