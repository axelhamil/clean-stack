import type { StaffPermission } from "@packages/access-control";

export interface UnbanUserInput {
  actorUserId: string;
  actorPermissions: readonly StaffPermission[];
  userId: string;
}
