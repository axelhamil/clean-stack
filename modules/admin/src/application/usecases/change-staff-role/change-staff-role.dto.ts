import type { StaffPermission } from "@packages/access-control";
import type { RoleChangeParams } from "../../approved-action";

export interface ChangeStaffRoleInput {
  actorUserId: string;
  actorPermissions: readonly StaffPermission[];
  targetUserId: string;
  change: RoleChangeParams;
}
