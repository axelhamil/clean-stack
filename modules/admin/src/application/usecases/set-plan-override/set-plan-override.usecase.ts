import { type AppError, type IUnitOfWork, type IUseCase, Result, uuidv7 } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type { IAdminOrgStore } from "../../ports/repositories/admin-org-store.port";
import type { AdminStoreError } from "../../ports/repositories/admin-user-store.port";
import type {
  IPlanOverrideStore,
  PlanOverrideStoreError,
} from "../../ports/repositories/plan-override.port";
import type { SetPlanOverrideInput } from "./set-plan-override.dto";

export type SetPlanOverrideError =
  | PlanOverrideStoreError
  | AdminStoreError
  | AppError<"ADMIN_ORG_NOT_FOUND">
  | AppError<"ADMIN_PLAN_OVERRIDE_ALREADY_SET_CONFLICT">;

export class SetPlanOverrideUseCase
  implements IUseCase<SetPlanOverrideInput, void, SetPlanOverrideError>
{
  constructor(
    private readonly overrides: IPlanOverrideStore,
    private readonly orgs: IAdminOrgStore,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
  ) {}

  async execute(input: SetPlanOverrideInput): Promise<Result<void, SetPlanOverrideError>> {
    const { actorUserId, organizationId, tier, expiresAt, note } = input;

    const org = await this.orgs.findOrgById(organizationId);
    if (org.isFailure) return Result.fail(org.getError());
    if (org.getValue().isNone()) {
      return Result.fail({
        code: "ADMIN_ORG_NOT_FOUND",
        message: "This organization no longer exists.",
      });
    }

    return this.uow.run(async (): Promise<Result<void, SetPlanOverrideError>> => {
      const closed = await this.overrides.closeOpen(organizationId);
      if (closed.isFailure) return Result.fail(closed.getError());

      const overrideId = uuidv7();
      const written = await this.overrides.insert({
        id: overrideId,
        organizationId,
        tier,
        expiresAt,
        note,
        createdBy: actorUserId,
      });
      if (written.isFailure) return Result.fail(written.getError());
      if (!written.getValue()) {
        return Result.fail({
          code: "ADMIN_PLAN_OVERRIDE_ALREADY_SET_CONFLICT",
          message: "A colleague just set a plan override on this organization.",
        });
      }

      await emitEvent(
        this.outbox,
        EventTypes.ADMIN_PLAN_OVERRIDE_SET,
        "plan_override",
        overrideId,
        {
          actorUserId,
          overrideId,
          organizationId,
          tier,
          expiresAt: expiresAt.toISOString(),
          replacedOverrideId: closed.getValue().toNull(),
        },
      );

      return Result.ok();
    });
  }
}
