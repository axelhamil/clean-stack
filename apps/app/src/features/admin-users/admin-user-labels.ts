import { z } from "zod";

/**
 * BetterAuth's admin plugin models a user's platform-wide role as
 * `"admin" | "user"` (see `set-role.dto.ts`), but the wire response widens it
 * to `string | null` (`AdminUserListItem["role"]`, `AdminUserDetail["role"]`).
 * A cast would assert the shape; this guard proves it, and the raw value is
 * the fallback for anything that doesn't match.
 *
 * This is a different concept from `common.roles` (an organization
 * membership role — owner/admin/member): the "admin" entry below reuses
 * `common:roles.admin` because it is the exact same word for the exact same
 * concept ("Admin"), but there is no organization-role equivalent for the
 * platform's default "user" role, so that entry gets its own catalog key.
 *
 * `satisfies Record<PlatformRole, string>` only proves every role has AN
 * entry — it cannot catch a swapped pair (e.g. `admin` pointing at
 * `users.roleUser`), which is why `__tests__/admin-user-labels.test.ts`
 * asserts the mapping directly.
 *
 * The cross-namespace entry carries its own `common:` prefix so call sites
 * can write `t(PLATFORM_ROLE_LABEL_KEYS[role])` directly, matching the
 * repo's existing literal cross-namespace pattern (`t("common:actions.cancel")`).
 * The `user` entry stays unprefixed — call sites resolve it against their own
 * bound `admin` namespace, and `useTranslation`'s generated key union only
 * accepts an explicit `ns:` prefix for a namespace it was bound with
 * (`useTranslation(["admin", "common"])`), never a self-prefix on the
 * default namespace.
 */
export const platformRoleSchema = z.enum(["admin", "user"]);
export type PlatformRole = z.infer<typeof platformRoleSchema>;

export const PLATFORM_ROLE_LABEL_KEYS = {
  admin: "common:roles.admin",
  user: "users.roleUser",
} as const satisfies Record<PlatformRole, string>;

export function isPlatformRole(value: string): value is PlatformRole {
  return platformRoleSchema.safeParse(value).success;
}

/**
 * The account's ban state, rendered as copy at three call sites (the list
 * filter, the list row badge, the detail page badge). Unlike the role above,
 * `user.banned` arrives as a real `boolean` — there is no widened wire
 * string to guard against — but the label is still worth a lookup plus a
 * mapping test so the three call sites can never drift the wording apart or
 * swap the active/suspended pair.
 */
export type UserStatus = "active" | "suspended";

export const USER_STATUS_LABEL_KEYS = {
  active: "users.status.active",
  suspended: "users.status.suspended",
} as const satisfies Record<UserStatus, string>;

export function userStatusFromBanned(banned: boolean): UserStatus {
  return banned ? "suspended" : "active";
}
