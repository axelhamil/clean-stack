import { type IUseCase, Option, type Result } from "@packages/ddd-kit";
import type { ApprovalRequestError, ApprovalService } from "../../services/approval.service";
import { type GatedOutcome, runUnlessGated } from "../../services/gated-outcome";
import type { StaffChangeError, StaffService } from "../../services/staff.service";
import type { SetStaffOverrideInput } from "./set-staff-override.dto";

export type SetStaffOverrideError = ApprovalRequestError | StaffChangeError;

export class SetStaffOverrideUseCase
  implements IUseCase<SetStaffOverrideInput, GatedOutcome, SetStaffOverrideError>
{
  constructor(
    private readonly approvals: Pick<ApprovalService, "gate">,
    private readonly staff: Pick<StaffService, "setOverride">,
  ) {}

  async execute(
    input: SetStaffOverrideInput,
  ): Promise<Result<GatedOutcome, SetStaffOverrideError>> {
    const { actorUserId, actorPermissions, targetUserId, override } = input;
    const gated = await this.approvals.gate({
      action: "staff.permission_override",
      subjectId: targetUserId,
      params: { op: "set", ...override },
      requestedBy: actorUserId,
      requesterPermissions: actorPermissions,
    });

    return runUnlessGated(gated, () =>
      this.staff.setOverride({
        actorUserId,
        actorPermissions,
        targetUserId,
        permission: override.permission,
        effect: override.effect,
        expiresAt: Option.fromNullable(override.expiresAt).map((iso) => new Date(iso)),
      }),
    );
  }
}
