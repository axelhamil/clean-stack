import { type AppError, type IUnitOfWork, type IUseCase, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type {
  IStripeEventStore,
  StripeEventStoreError,
  StripeReplayRule,
} from "../../ports/repositories/stripe-event.port";
import type {
  IStripeEventGateway,
  StripeEventRetrieveError,
  StripeGatewayError,
} from "../../ports/services/stripe-event-gateway.port";
import type { ReplayStripeEventInput } from "./replay-stripe-event.dto";

const REPLAY_CLAIM_SECONDS = 120;

export type StripeReplayError =
  | StripeEventStoreError
  | StripeEventRetrieveError
  | AppError<"ADMIN_STRIPE_UNAVAILABLE">
  | AppError<"ADMIN_STRIPE_EVENT_NOT_FOUND">
  | AppError<"ADMIN_STRIPE_REPLAY_BLOCKED">
  | AppError<"ADMIN_STRIPE_REPLAY_CONFLICT">
  | AppError<"ADMIN_STRIPE_REPLAY_PROVIDER_FAILURE">;

export class ReplayStripeEventUseCase<Handler>
  implements IUseCase<ReplayStripeEventInput<Handler>, void, StripeReplayError>
{
  constructor(
    private readonly stripeEvents: IStripeEventStore,
    private readonly gateway: IStripeEventGateway<Handler>,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
    private readonly isReplayable: StripeReplayRule,
  ) {}

  async execute(input: ReplayStripeEventInput<Handler>): Promise<Result<void, StripeReplayError>> {
    if (!this.gateway.isConfigured()) {
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
        message: "No record of this event here: it was purged past its retention or never arrived.",
      });
    }

    const { id, type } = known.unwrap();
    if (!this.isReplayable(type)) {
      return Result.fail({
        code: "ADMIN_STRIPE_REPLAY_BLOCKED",
        message: `The platform does not process ${type} events, a replay would change nothing.`,
      });
    }

    const copy = await this.gateway.retrieve(id);
    if (copy.isFailure) return Result.fail(copy.getError());

    const claimed = await this.stripeEvents.claimReplay(id, REPLAY_CLAIM_SECONDS);
    if (claimed.isFailure) return Result.fail(claimed.getError());
    if (!claimed.getValue()) {
      return Result.fail({
        code: "ADMIN_STRIPE_REPLAY_CONFLICT",
        message: "This event was just replayed. Check its status before trying again.",
      });
    }

    const delivered = await this.gateway.redeliver(copy.getValue(), input.handler);
    const failure = await this.failureOf(id, delivered);

    const settled = await this.uow.run(async (): Promise<Result<void, StripeEventStoreError>> => {
      const written = failure.isSome()
        ? await this.keepFailure({ id, type, reason: failure.unwrap() })
        : await this.stripeEvents.markReplayed(id);
      if (written.isFailure) return Result.fail(written.getError());

      await emitEvent(this.outbox, EventTypes.ADMIN_OPS_STRIPE_EVENT_REPLAYED, "stripe_event", id, {
        actorUserId: input.actorUserId,
        stripeEventId: id,
        stripeEventType: type,
        outcome: failure.isSome() ? "failed" : "succeeded",
      });

      return Result.ok();
    });
    if (settled.isFailure) return Result.fail(settled.getError());
    if (failure.isNone()) return Result.ok();

    return Result.fail({
      code: "ADMIN_STRIPE_REPLAY_PROVIDER_FAILURE",
      message: failure.unwrap(),
    });
  }

  private async failureOf(
    id: string,
    delivered: Result<void, StripeGatewayError>,
  ): Promise<Option<string>> {
    const recorded = await this.recordedFailure(id);
    if (delivered.isSuccess || recorded.isSome()) return recorded;

    return Option.some(delivered.getError().message);
  }

  private async recordedFailure(id: string): Promise<Option<string>> {
    const after = await this.stripeEvents.find(id);
    if (after.isFailure) return Option.some(after.getError().message);

    return after
      .getValue()
      .filter((row) => row.status === "failed")
      .map((row) => row.lastError.unwrapOr("The replay did not sync."));
  }

  private async keepFailure(failure: {
    id: string;
    type: string;
    reason: string;
  }): Promise<Result<void, StripeEventStoreError>> {
    const recorded = await this.stripeEvents.recordDelivery({
      id: failure.id,
      type: failure.type,
      lastError: Option.some(failure.reason),
    });
    if (recorded.isFailure) return recorded;

    return this.stripeEvents.releaseReplay(failure.id);
  }
}
