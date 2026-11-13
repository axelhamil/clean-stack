import type { StaffPermission } from "@packages/access-control";
import type { OverrideParams } from "../../approved-action";

export interface SetStaffOverrideInput {
  actorUserId: string;
  actorPermissions: readonly StaffPermission[];
  targetUserId: string;
  override: OverrideParams;
}
