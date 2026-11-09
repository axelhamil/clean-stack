import { type IUnitOfWork, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { ISweepRunStore, SweepRun, SweepRunStoreError } from "@packages/http/sweep-run.port";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { isSweepLate } from "../../../../shared/internal-routes/sweep-cadence";
import type {
  DeadOutboxPage,
  DeadQueueCounts,
  IOpsStore,
  OpsStoreError,
} from "../ports/ops-store.port";

export const DEAD_OUTBOX_PAGE = 100;

export type OpsConfig = { OUTBOX_LEASE_SECONDS: number };

export type SweepRunState = SweepRun & { late: boolean };

export class OpsService {
  constructor(
    private readonly store: IOpsStore,
    private readonly sweepRuns: ISweepRunStore,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
    private readonly config: OpsConfig,
  ) {}

  async deadLetters(): Promise<
    Result<{ outbox: DeadOutboxPage; queues: DeadQueueCounts }, OpsStoreError>
  > {
    const outbox = await this.store.listDeadOutbox(DEAD_OUTBOX_PAGE);
    if (outbox.isFailure) return Result.fail(outbox.getError());

    const queues = await this.store.countDeadQueues();
    if (queues.isFailure) return Result.fail(queues.getError());

    return Result.ok({ outbox: outbox.getValue(), queues: queues.getValue() });
  }

  async requeue(input: {
    actorUserId: string;
    ids: string[];
  }): Promise<Result<{ requeued: number }, OpsStoreError>> {
    return this.uow.run(async (): Promise<Result<{ requeued: number }, OpsStoreError>> => {
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

  async sweeps(): Promise<Result<SweepRunState[], SweepRunStoreError>> {
    const runs = await this.sweepRuns.list();
    if (runs.isFailure) return Result.fail(runs.getError());

    const now = new Date();

    return Result.ok(runs.getValue().map((run) => ({ ...run, late: isSweepLate(run, now) })));
  }
}
