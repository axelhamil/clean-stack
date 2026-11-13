import { type AppError, Option, Result } from "@packages/ddd-kit";
import type {
  ApprovalActor,
  ApprovalHandler,
  ApprovedActionOf,
  RequestParams,
  StoredParams,
} from "../../approved-action";
import type { StaffService } from "../staff.service";

type Action = "staff.permission_override";

export class PermissionOverrideApprovalHandler implements ApprovalHandler<Action> {
  constructor(
    private readonly staff: Pick<
      StaffService,
      | "refuseOverride"
      | "refuseOverrideRemoval"
      | "refusedOverrideGrant"
      | "setOverride"
      | "removeOverride"
    >,
  ) {}

  async prepare(
    { subjectId, params }: { subjectId: string; params: RequestParams[Action] },
    actor: ApprovalActor,
  ): Promise<Result<StoredParams[Action], AppError>> {
    const change = {
      actorUserId: actor.userId,
      actorPermissions: actor.permissions,
      targetUserId: subjectId,
    };

    if (params.op === "set") {
      const expiresAt = params.expiresAt ?? null;
      const refused = await this.staff.refuseOverride({
        ...change,
        permission: params.permission,
        effect: params.effect,
        expiresAt: Option.fromNullable(expiresAt).map((iso) => new Date(iso)),
      });

      return refused.isFailure
        ? Result.fail(refused.getError())
        : Result.ok({
            op: "set" as const,
            permission: params.permission,
            effect: params.effect,
            expiresAt,
          });
    }

    const live = await this.staff.refuseOverrideRemoval({
      ...change,
      overrideId: params.overrideId,
    });
    if (live.isFailure) return Result.fail(live.getError());

    const row = live.getValue();

    return Result.ok({
      op: "revoke" as const,
      overrideId: params.overrideId,
      permission: row.permission,
      effect: row.effect,
      expiresAt: row.expiresAt.map((at) => at.toISOString()).toNull(),
    });
  }

  async authorize(
    { params }: ApprovedActionOf<Action>,
    actor: ApprovalActor,
  ): Promise<Result<void, AppError>> {
    return this.staff.refusedOverrideGrant({
      actorPermissions: actor.permissions,
      permission: params.permission,
      effect: params.effect,
      liftsOverride: params.op === "revoke",
    });
  }

  run(
    { subjectId, params }: ApprovedActionOf<Action>,
    actor: ApprovalActor,
  ): Promise<Result<void, AppError>> {
    const change = {
      actorUserId: actor.userId,
      actorPermissions: actor.permissions,
      targetUserId: subjectId,
    };

    return params.op === "set"
      ? this.staff.setOverride({
          ...change,
          permission: params.permission,
          effect: params.effect,
          expiresAt: Option.fromNullable(params.expiresAt).map((iso) => new Date(iso)),
        })
      : this.staff.removeOverride({ ...change, overrideId: params.overrideId });
  }
}
