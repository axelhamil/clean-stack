import { type IUseCase, Option, Result } from "@packages/ddd-kit";
import type { AdminStoreError } from "../../ports/repositories/admin-user-store.port";
import type { StaffStoreError } from "../../ports/repositories/staff-store.port";
import type {
  AdminModerationError,
  AdminModerationService,
} from "../../services/admin-moderation.service";
import type { ApprovalRequestError, ApprovalService } from "../../services/approval.service";
import { type GatedOutcome, runUnlessGated } from "../../services/gated-outcome";
import type { StaffBanError, StaffService } from "../../services/staff.service";
import type { BanUserInput } from "./ban-user.dto";

export type BanUserError =
  | StaffStoreError
  | AdminStoreError
  | ApprovalRequestError
  | StaffBanError
  | AdminModerationError;

export class BanUserUseCase implements IUseCase<BanUserInput, GatedOutcome, BanUserError> {
  constructor(
    private readonly staff: Pick<StaffService, "banIsSensitive" | "moderateBan">,
    private readonly approvals: Pick<ApprovalService, "gate">,
    private readonly moderation: Pick<AdminModerationService, "ban">,
  ) {}

  async execute(input: BanUserInput): Promise<Result<GatedOutcome, BanUserError>> {
    const { actorUserId, actorPermissions, userId, ban } = input;
    const sensitive = await this.staff.banIsSensitive({
      targetUserId: userId,
      expiresIn: ban.expiresIn,
    });
    if (sensitive.isFailure) return Result.fail(sensitive.getError());

    const gated: Result<Option<string>, ApprovalRequestError> = sensitive.getValue()
      ? await this.gate(input)
      : Result.ok(Option.none());

    return runUnlessGated(gated, () =>
      this.staff.moderateBan({ actorPermissions, targetUserId: userId }, () =>
        this.moderation.ban({
          actorUserId,
          userId,
          reason: ban.reason,
          expiresIn: ban.expiresIn,
        }),
      ),
    );
  }

  private async gate(input: BanUserInput): Promise<Result<Option<string>, ApprovalRequestError>> {
    await input.confirmStepUp();

    return this.approvals.gate({
      action: "user.ban_permanent",
      subjectId: input.userId,
      params: input.ban,
      requestedBy: input.actorUserId,
      requesterPermissions: input.actorPermissions,
    });
  }
}
