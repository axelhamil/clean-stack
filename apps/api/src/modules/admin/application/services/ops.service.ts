import type { IUnitOfWork } from "@packages/ddd-kit";
import { type AppError, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "../../../../shared/event-emitter";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";
import type {
  IStripeEventGateway,
  IStripeEventStore,
  StripeEventRow,
  StripeEventStoreError,
  StripeGatewayError,
  StripeWebhookHandler,
} from "../../../../shared/ports/stripe-event.port";
import type {
  ISweepRunStore,
  SweepRun,
  SweepRunStoreError,
} from "../../../../shared/ports/sweep-run.port";
import type {
  DeadOutboxPage,
  DeadQueueCounts,
  IOpsStore,
  OpsStoreError,
} from "../ports/ops-store.port";

export const DEAD_OUTBOX_PAGE = 100;
export const STRIPE_EVENTS_PAGE = 100;

export type OpsConfig = { OUTBOX_LEASE_SECONDS: number };

export type StripeReplayError =
  | StripeEventStoreError
  | StripeGatewayError
  | AppError<"ADMIN_STRIPE_UNAVAILABLE">
  | AppError<"ADMIN_STRIPE_EVENT_NOT_FOUND">;

export class OpsService {
  constructor(
    private readonly store: IOpsStore,
    private readonly sweepRuns: ISweepRunStore,
    private readonly stripeEvents: IStripeEventStore,
    private readonly stripeGateway: IStripeEventGateway,
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
      const moved = await this.store.requeueDead(input.ids, this.config.OUTBOX_LEASE_SECONDS);
      if (moved.isFailure) return Result.fail(moved.getError());

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

  sweeps(): Promise<Result<SweepRun[], SweepRunStoreError>> {
    return this.sweepRuns.list();
  }

  async listStripeEvents(): Promise<
    Result<{ configured: boolean; items: StripeEventRow[] }, StripeEventStoreError>
  > {
    const items = await this.stripeEvents.list(STRIPE_EVENTS_PAGE);
    if (items.isFailure) return Result.fail(items.getError());

    return Result.ok({ configured: this.stripeGateway.isConfigured(), items: items.getValue() });
  }

  async replay(input: {
    actorUserId: string;
    stripeEventId: string;
    handler: StripeWebhookHandler;
  }): Promise<Result<void, StripeReplayError>> {
    if (!this.stripeGateway.isConfigured()) {
      return Result.fail({
        code: "ADMIN_STRIPE_UNAVAILABLE",
        message: "Stripe is not configured on this platform.",
      });
    }

    const found = await this.stripeEvents.find(input.stripeEventId);
    if (found.isFailure) return Result.fail(found.getError());

    const known = found.getValue();
    if (known.isNone()) {
      return Result.fail({
        code: "ADMIN_STRIPE_EVENT_NOT_FOUND",
        message: "This platform never received this event.",
      });
    }

    const { id, type } = known.unwrap();
    const copy = await this.stripeGateway.retrieve(id);
    if (copy.isFailure) return Result.fail(copy.getError());

    const replayed = await this.uow.run(async (): Promise<Result<void, StripeReplayError>> => {
      const marked = await this.stripeEvents.markReplayed(id);
      if (marked.isFailure) return Result.fail(marked.getError());

      await emitEvent(this.outbox, EventTypes.ADMIN_OPS_STRIPE_EVENT_REPLAYED, "stripe_event", id, {
        actorUserId: input.actorUserId,
        stripeEventId: id,
        stripeEventType: type,
      });

      return this.stripeGateway.redeliver(copy.getValue(), input.handler);
    });
    if (replayed.isSuccess) return replayed;

    await this.stripeEvents.recordDelivery({
      id,
      type,
      lastError: Option.some(replayed.getError().message),
    });

    return replayed;
  }
}
