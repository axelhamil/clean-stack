import type { StaffPermission } from "@packages/access-control";
import type { AppError, Result } from "@packages/ddd-kit";
import { di } from "../../container";
import type { ApprovedAction } from "./application/approved-action";

interface Decider {
  userId: string;
  permissions: readonly StaffPermission[];
}

export function runApprovedAction(
  approved: ApprovedAction,
  decider: Decider,
): Promise<Result<void, AppError>> {
  const { subjectId } = approved;

  switch (approved.action) {
    case "user.ban_permanent":
      return di.StaffService.moderateBan(
        { actorPermissions: decider.permissions, targetUserId: subjectId },
        () =>
          di.AdminModerationService.ban({
            actorUserId: decider.userId,
            userId: subjectId,
            reason: approved.params.reason,
            expiresIn: approved.params.expiresIn,
          }),
      );
    case "staff.role_change":
      return di.StaffService.assignRole({
        actorUserId: decider.userId,
        targetUserId: subjectId,
        role: approved.params.role,
      });
    case "staff.revoke":
      return di.StaffService.revoke({ actorUserId: decider.userId, targetUserId: subjectId });
  }
}
