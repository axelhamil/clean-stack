import { type AppError, Result } from "@packages/ddd-kit";
import type {
  ApprovalActor,
  ApprovalHandler,
  ApprovedActionOf,
  RequestParams,
  StoredParams,
} from "../../approved-action";
import type { AdminModerationService } from "../admin-moderation.service";
import type { StaffService } from "../staff.service";

type Action = "user.ban_permanent";

export class BanPermanentApprovalHandler implements ApprovalHandler<Action> {
  constructor(
    private readonly staff: Pick<StaffService, "refuseBan" | "refuseTarget" | "moderateBan">,
    private readonly moderation: Pick<AdminModerationService, "ban">,
  ) {}

  async prepare(
    { subjectId, params }: { subjectId: string; params: RequestParams[Action] },
    actor: ApprovalActor,
  ): Promise<Result<StoredParams[Action], AppError>> {
    const refused = await this.staff.refuseBan({
      actorPermissions: actor.permissions,
      targetUserId: subjectId,
    });

    return refused.isFailure ? Result.fail(refused.getError()) : Result.ok(params);
  }

  authorize(
    { subjectId }: ApprovedActionOf<Action>,
    actor: ApprovalActor,
  ): Promise<Result<void, AppError>> {
    return this.staff.refuseTarget({
      actorPermissions: actor.permissions,
      targetUserId: subjectId,
    });
  }

  run(
    { subjectId, params }: ApprovedActionOf<Action>,
    actor: ApprovalActor,
  ): Promise<Result<void, AppError>> {
    return this.staff.moderateBan(
      { actorPermissions: actor.permissions, targetUserId: subjectId },
      () =>
        this.moderation.ban({
          actorUserId: actor.userId,
          userId: subjectId,
          reason: params.reason,
          expiresIn: params.expiresIn,
        }),
    );
  }
}
