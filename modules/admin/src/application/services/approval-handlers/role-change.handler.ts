import { type AppError, Result } from "@packages/ddd-kit";
import type {
  ApprovalActor,
  ApprovalHandler,
  ApprovedActionOf,
  RequestParams,
  StoredParams,
} from "../../approved-action";
import type { StaffService } from "../staff.service";

type Action = "staff.role_change";

export class RoleChangeApprovalHandler implements ApprovalHandler<Action> {
  constructor(
    private readonly staff: Pick<
      StaffService,
      "refuseRoleChange" | "refusedRoleGrant" | "assignRole"
    >,
  ) {}

  async prepare(
    { subjectId, params }: { subjectId: string; params: RequestParams[Action] },
    actor: ApprovalActor,
  ): Promise<Result<StoredParams[Action], AppError>> {
    const from = await this.staff.refuseRoleChange({
      actorUserId: actor.userId,
      actorPermissions: actor.permissions,
      targetUserId: subjectId,
      role: params.role,
    });

    return from.isFailure
      ? Result.fail(from.getError())
      : Result.ok({ role: params.role, fromRole: from.getValue().toNull() });
  }

  async authorize(
    { subjectId, params }: ApprovedActionOf<Action>,
    actor: ApprovalActor,
  ): Promise<Result<void, AppError>> {
    return this.staff.refusedRoleGrant({
      actorUserId: actor.userId,
      actorPermissions: actor.permissions,
      targetUserId: subjectId,
      role: params.role,
    });
  }

  run(
    { subjectId, params }: ApprovedActionOf<Action>,
    actor: ApprovalActor,
  ): Promise<Result<void, AppError>> {
    return this.staff.assignRole({
      actorUserId: actor.userId,
      actorPermissions: actor.permissions,
      targetUserId: subjectId,
      role: params.role,
      expectedRole: params.fromRole,
    });
  }
}
