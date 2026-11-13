import { type AppError, type IUnitOfWork, type IUseCase, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type {
  IPlanOverrideStore,
  PlanOverrideStoreError,
} from "../../ports/repositories/plan-override.port";
import type { RevokePlanOverrideInput } from "./revoke-plan-override.dto";

export type RevokePlanOverrideError =
  | PlanOverrideStoreError
  | AppError<"ADMIN_PLAN_OVERRIDE_NOT_FOUND">;

export class RevokePlanOverrideUseCase
  implements IUseCase<RevokePlanOverrideInput, void, RevokePlanOverrideError>
{
  constructor(
    private readonly overrides: IPlanOverrideStore,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
  ) {}

  execute(input: RevokePlanOverrideInput): Promise<Result<void, RevokePlanOverrideError>> {
    const { actorUserId, organizationId } = input;

    return this.uow.run(async (): Promise<Result<void, RevokePlanOverrideError>> => {
      const revoked = await this.overrides.revokeActive(organizationId);
      if (revoked.isFailure) return Result.fail(revoked.getError());

      const row = revoked.getValue();
      if (row.isNone()) {
        return Result.fail({
          code: "ADMIN_PLAN_OVERRIDE_NOT_FOUND",
          message: "This organization has no active plan override.",
        });
      }

      const { id, tier } = row.unwrap();
      await emitEvent(this.outbox, EventTypes.ADMIN_PLAN_OVERRIDE_REVOKED, "plan_override", id, {
        actorUserId,
        overrideId: id,
        organizationId,
        tier,
      });

      return Result.ok();
    });
  }
}
