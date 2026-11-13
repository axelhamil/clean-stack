import type { StaffPermission } from "@packages/access-control";

export interface RemoveStaffOverrideInput {
  actorUserId: string;
  actorPermissions: readonly StaffPermission[];
  targetUserId: string;
  overrideId: string;
}
