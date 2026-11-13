import type { IUseCase, Result } from "@packages/ddd-kit";
import type { ApprovalRequestError, ApprovalService } from "../../services/approval.service";
import { type GatedOutcome, runUnlessGated } from "../../services/gated-outcome";
import type { StaffChangeError, StaffService } from "../../services/staff.service";
import type { ChangeStaffRoleInput } from "./change-staff-role.dto";

export type ChangeStaffRoleError = ApprovalRequestError | StaffChangeError;

export class ChangeStaffRoleUseCase
  implements IUseCase<ChangeStaffRoleInput, GatedOutcome, ChangeStaffRoleError>
{
  constructor(
    private readonly approvals: Pick<ApprovalService, "gate">,
    private readonly staff: Pick<StaffService, "assignRole">,
  ) {}

  async execute(input: ChangeStaffRoleInput): Promise<Result<GatedOutcome, ChangeStaffRoleError>> {
    const { actorUserId, actorPermissions, targetUserId, change } = input;
    const gated = await this.approvals.gate({
      action: "staff.role_change",
      subjectId: targetUserId,
      params: change,
      requestedBy: actorUserId,
      requesterPermissions: actorPermissions,
    });

    return runUnlessGated(gated, () =>
      this.staff.assignRole({ actorUserId, actorPermissions, targetUserId, role: change.role }),
    );
  }
}
