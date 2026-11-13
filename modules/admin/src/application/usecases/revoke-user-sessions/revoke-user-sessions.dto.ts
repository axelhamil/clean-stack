import type { StaffPermission } from "@packages/access-control";

export interface RevokeUserSessionsInput {
  actorUserId: string;
  actorPermissions: readonly StaffPermission[];
  userId: string;
}
