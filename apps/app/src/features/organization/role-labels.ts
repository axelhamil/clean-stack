import type { z } from "zod";
import { memberRoleSchema } from "../../shared/auth/organization.schema";

export type OrgRole = z.infer<typeof memberRoleSchema>;

/**
 * One lookup shared by every screen that renders a member/invitation role as
 * copy (member-row, invite-member-form, transfer-leave-dialog) so the three
 * copies of "Owner"/"Admin"/"Member" collapse into one `common.roles` entry
 * each. `satisfies Record<OrgRole, string>` only proves every role is present
 * — it cannot catch a swapped pair (e.g. `owner` pointing at `roles.admin`),
 * which is why `__tests__/role-labels.test.ts` asserts the mapping directly.
 *
 * Keys carry their own `common:` namespace prefix so call sites can write
 * `t(ROLE_LABEL_KEYS[role])` directly — matching the repo's existing literal
 * cross-namespace pattern (`t("common:actions.cancel")`) instead of building
 * the prefixed string at the call site with a template literal.
 */
export const ROLE_LABEL_KEYS = {
  owner: "common:roles.owner",
  admin: "common:roles.admin",
  member: "common:roles.member",
} as const satisfies Record<OrgRole, string>;

export function isOrgRole(value: string): value is OrgRole {
  return memberRoleSchema.safeParse(value).success;
}
