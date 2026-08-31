import { z } from "zod";

/**
 * BetterAuth's organization plugin models invitation status as
 * "pending" | "accepted" | "rejected" | "canceled" (see the `invitation`
 * table's `status` column). The app's own wire types widen this to `string`,
 * so — same as `role-labels.ts` — a lookup plus a guard replaces a cast.
 * `InvitationRow` only ever renders "pending" invitations in practice
 * (filtered in `organization.route.tsx`), but the Badge's prop type doesn't
 * encode that, so the fallback branch below keeps the component honest.
 */
export const invitationStatusSchema = z.enum(["pending", "accepted", "rejected", "canceled"]);
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

export const INVITATION_STATUS_LABEL_KEYS = {
  pending: "organization.invitationStatusPending",
  accepted: "organization.invitationStatusAccepted",
  rejected: "organization.invitationStatusRejected",
  canceled: "organization.invitationStatusCanceled",
} as const satisfies Record<InvitationStatus, string>;

export function isInvitationStatus(value: string): value is InvitationStatus {
  return invitationStatusSchema.safeParse(value).success;
}
