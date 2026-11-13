import type { IUseCase, Result } from "@packages/ddd-kit";
import type { ApprovalRequestError, ApprovalService } from "../../services/approval.service";
import { type GatedOutcome, runUnlessGated } from "../../services/gated-outcome";
import type { StaffChangeError, StaffService } from "../../services/staff.service";
import type { RemoveStaffOverrideInput } from "./remove-staff-override.dto";

export type RemoveStaffOverrideError = ApprovalRequestError | StaffChangeError;

export class RemoveStaffOverrideUseCase
  implements IUseCase<RemoveStaffOverrideInput, GatedOutcome, RemoveStaffOverrideError>
{
  constructor(
    private readonly approvals: Pick<ApprovalService, "gate">,
    private readonly staff: Pick<StaffService, "removeOverride">,
  ) {}

  async execute(
    input: RemoveStaffOverrideInput,
  ): Promise<Result<GatedOutcome, RemoveStaffOverrideError>> {
    const { actorUserId, actorPermissions, targetUserId, overrideId } = input;
    const gated = await this.approvals.gate({
      action: "staff.permission_override",
      subjectId: targetUserId,
      params: { op: "revoke", overrideId },
      requestedBy: actorUserId,
      requesterPermissions: actorPermissions,
    });

    return runUnlessGated(gated, () =>
      this.staff.removeOverride({ actorUserId, actorPermissions, targetUserId, overrideId }),
    );
  }
}
