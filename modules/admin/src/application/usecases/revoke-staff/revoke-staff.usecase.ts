import type { IUseCase, Result } from "@packages/ddd-kit";
import type { ApprovalRequestError, ApprovalService } from "../../services/approval.service";
import { type GatedOutcome, runUnlessGated } from "../../services/gated-outcome";
import type { StaffChangeError, StaffService } from "../../services/staff.service";
import type { RevokeStaffInput } from "./revoke-staff.dto";

export type RevokeStaffError = ApprovalRequestError | StaffChangeError;

export class RevokeStaffUseCase
  implements IUseCase<RevokeStaffInput, GatedOutcome, RevokeStaffError>
{
  constructor(
    private readonly approvals: Pick<ApprovalService, "gate">,
    private readonly staff: Pick<StaffService, "revoke">,
  ) {}

  async execute(input: RevokeStaffInput): Promise<Result<GatedOutcome, RevokeStaffError>> {
    const { actorUserId, actorPermissions, targetUserId } = input;
    const gated = await this.approvals.gate({
      action: "staff.revoke",
      subjectId: targetUserId,
      params: {},
      requestedBy: actorUserId,
      requesterPermissions: actorPermissions,
    });

    return runUnlessGated(gated, () => this.staff.revoke({ actorUserId, targetUserId }));
  }
}
