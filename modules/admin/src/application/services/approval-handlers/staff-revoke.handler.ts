import { type AppError, Result } from "@packages/ddd-kit";
import type {
  ApprovalActor,
  ApprovalHandler,
  ApprovedActionOf,
  RequestParams,
  StoredParams,
} from "../../approved-action";
import type { StaffService } from "../staff.service";

type Action = "staff.revoke";

export class StaffRevokeApprovalHandler implements ApprovalHandler<Action> {
  constructor(private readonly staff: Pick<StaffService, "refuseRevoke" | "revoke">) {}

  async prepare(
    { subjectId, params }: { subjectId: string; params: RequestParams[Action] },
    actor: ApprovalActor,
  ): Promise<Result<StoredParams[Action], AppError>> {
    const refused = await this.staff.refuseRevoke({
      actorUserId: actor.userId,
      targetUserId: subjectId,
    });

    return refused.isFailure ? Result.fail(refused.getError()) : Result.ok(params);
  }

  async authorize(): Promise<Result<void, AppError>> {
    return Result.ok();
  }

  run(
    { subjectId }: ApprovedActionOf<Action>,
    actor: ApprovalActor,
  ): Promise<Result<void, AppError>> {
    return this.staff.revoke({ actorUserId: actor.userId, targetUserId: subjectId });
  }
}
