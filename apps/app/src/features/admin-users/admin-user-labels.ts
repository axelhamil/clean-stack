/**
 * The account's ban state, rendered as copy at three call sites (the list
 * filter, the list row badge, the detail page badge). `user.banned` arrives as
 * a real `boolean`, but the label is still worth a lookup plus a mapping test
 * so the three call sites can never drift the wording apart or swap the
 * active/suspended pair.
 */
export type UserStatus = "active" | "suspended";

export const USER_STATUS_LABEL_KEYS = {
  active: "users.status.active",
  suspended: "users.status.suspended",
} as const satisfies Record<UserStatus, string>;

export function userStatusFromBanned(banned: boolean): UserStatus {
  return banned ? "suspended" : "active";
}
