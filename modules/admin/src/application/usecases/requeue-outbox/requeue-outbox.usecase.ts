import { type IUnitOfWork, type IUseCase, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type { OpsStoreError } from "../../ports/repositories/ops-store.port";
import type {
  RequeueOutboxConfig,
  RequeueOutboxInput,
  RequeueOutboxOutput,
} from "./requeue-outbox.dto";

export class RequeueOutboxUseCase
  implements IUseCase<RequeueOutboxInput, RequeueOutboxOutput, OpsStoreError>
{
  constructor(
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
    private readonly config: RequeueOutboxConfig,
  ) {}

  execute(input: RequeueOutboxInput): Promise<Result<RequeueOutboxOutput, OpsStoreError>> {
    return this.uow.run(async (): Promise<Result<RequeueOutboxOutput, OpsStoreError>> => {
      const moved = await this.outbox.requeueDead(input.ids, this.config.OUTBOX_LEASE_SECONDS);
      if (moved.isFailure) {
        return Result.fail({
          code: "ADMIN_OPS_PROVIDER_FAILURE",
          message: "The dead events could not be requeued.",
        });
      }

      const eventIds = moved.getValue();
      const [firstId] = eventIds;
      if (firstId === undefined) return Result.ok({ requeued: 0 });

      await emitEvent(this.outbox, EventTypes.ADMIN_OPS_OUTBOX_REQUEUED, "outbox_event", firstId, {
        actorUserId: input.actorUserId,
        requeued: eventIds.length,
        eventIds,
      });

      return Result.ok({ requeued: eventIds.length });
    });
  }
}
