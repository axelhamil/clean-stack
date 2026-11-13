import type { StaffPermission } from "@packages/access-control";

export interface RevokeStaffInput {
  actorUserId: string;
  actorPermissions: readonly StaffPermission[];
  targetUserId: string;
}
