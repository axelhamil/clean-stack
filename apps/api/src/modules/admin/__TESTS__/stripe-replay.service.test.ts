import { describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { enqueuedEvents } from "../../../shared/__TESTS__/enqueued-events";
import type { IOutboxRepository } from "../../../shared/ports/outbox.port";
import type {
  IStripeEventGateway,
  IStripeEventStore,
  StripeEventRow,
} from "../../../shared/ports/stripe-event.port";
import { StripeReplayService } from "../application/services/stripe-replay.service";

const ACTOR = "staff-1";
const KNOWN: StripeEventRow = {
  id: "evt_1",
  type: "invoice.payment_failed",
  receivedAt: new Date("2026-10-30T12:00:00Z"),
  status: "received",
  lastError: Option.none(),
  replayedAt: Option.none(),
};

function setup(given: { known?: boolean; configured?: boolean; claimed?: boolean } = {}) {
  const stripeEvents = mockPort<IStripeEventStore>();
  stripeEvents.find.mockImplementation(async () =>
    Result.ok(given.known === false ? Option.none() : Option.some(KNOWN)),
  );
  stripeEvents.claimReplay.mockImplementation(async () => Result.ok(given.claimed ?? true));
  stripeEvents.releaseReplay.mockImplementation(async () => Result.ok());
  stripeEvents.markReplayed.mockImplementation(async () => Result.ok());
  stripeEvents.recordDelivery.mockImplementation(async () => Result.ok());

  const gateway = mockPort<IStripeEventGateway>();
  gateway.isConfigured.mockImplementation(() => given.configured ?? true);
  gateway.retrieve.mockImplementation(async () => Result.ok({ payload: "{}" }));
  gateway.redeliver.mockImplementation(async () => Result.ok());

  const outbox = mockPort<IOutboxRepository>();
  outbox.enqueue.mockImplementation(async () => {});

  const uow = mockUnitOfWork();
  const service = new StripeReplayService(stripeEvents, gateway, outbox, uow.unitOfWork);

  return { service, stripeEvents, gateway, outbox, uow };
}

describe("StripeReplayService", () => {
  const handler = async () => new Response(null, { status: 200 });
  const replay = { actorUserId: ACTOR, stripeEventId: KNOWN.id, handler };

  it("answers a typed error when Stripe is not configured", async () => {
    const { service, gateway } = setup({ configured: false });

    const result = await service.replay(replay);

    expect(result.getError().code).toBe("ADMIN_STRIPE_UNAVAILABLE");
    expect(gateway.retrieve).not.toHaveBeenCalled();
  });

  it("refuses an event with no local record and says it may have been purged", async () => {
    const { service, gateway } = setup({ known: false });

    const result = await service.replay(replay);

    expect(result.getError().code).toBe("ADMIN_STRIPE_EVENT_NOT_FOUND");
    expect(result.getError().message).toContain("purged");
    expect(gateway.retrieve).not.toHaveBeenCalled();
  });

  it("passes on Stripe no longer holding the event, without claiming the replay", async () => {
    const { service, gateway, stripeEvents } = setup();
    gateway.retrieve.mockImplementation(async () =>
      Result.fail({ code: "STRIPE_EVENT_EXPIRED_NOT_FOUND", message: "gone" }),
    );

    const result = await service.replay(replay);

    expect(result.getError().code).toBe("STRIPE_EVENT_EXPIRED_NOT_FOUND");
    expect(stripeEvents.claimReplay).not.toHaveBeenCalled();
  });

  it("gives a concurrent replay a typed conflict and never runs the handler twice", async () => {
    const { service, gateway, outbox } = setup({ claimed: false });

    const result = await service.replay(replay);

    expect(result.getError().code).toBe("ADMIN_STRIPE_REPLAY_CONFLICT");
    expect(gateway.redeliver).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("runs the handler outside any transaction, then writes the outcome in one", async () => {
    const { service, gateway, stripeEvents, outbox, uow } = setup();
    let unitsWhenDelivered = -1;
    gateway.redeliver.mockImplementation(async () => {
      unitsWhenDelivered = uow.unitOfWork.run.mock.calls.length;
      return Result.ok();
    });

    const result = await service.replay(replay);

    expect(result.isSuccess).toBe(true);
    expect(unitsWhenDelivered).toBe(0);
    expect(uow.unitOfWork.run).toHaveBeenCalledTimes(1);
    expect(stripeEvents.markReplayed).toHaveBeenCalledWith(KNOWN.id);
    expect(enqueuedEvents(outbox)).toMatchObject([
      {
        eventType: EventTypes.ADMIN_OPS_STRIPE_EVENT_REPLAYED,
        payload: {
          actorUserId: ACTOR,
          stripeEventId: KNOWN.id,
          stripeEventType: KNOWN.type,
          outcome: "succeeded",
        },
      },
    ]);
  });

  it("fails when the delivery was refused, stores why and frees the claim", async () => {
    const { service, stripeEvents, gateway, outbox } = setup();
    gateway.redeliver.mockImplementation(async () =>
      Result.fail({ code: "STRIPE_PROVIDER_FAILURE", message: "handler answered 400" }),
    );

    const result = await service.replay(replay);

    expect(result.getError().code).toBe("ADMIN_STRIPE_REPLAY_PROVIDER_FAILURE");
    expect(stripeEvents.markReplayed).not.toHaveBeenCalled();
    expect(stripeEvents.releaseReplay).toHaveBeenCalledWith(KNOWN.id);
    expect(stripeEvents.recordDelivery).toHaveBeenCalledWith({
      id: KNOWN.id,
      type: KNOWN.type,
      lastError: Option.some("handler answered 400"),
    });
    expect(enqueuedEvents(outbox)).toMatchObject([{ payload: { outcome: "failed" } }]);
  });

  it("never answers ok when the handler said 200 but the sync check recorded a failure", async () => {
    const { service, stripeEvents } = setup();
    stripeEvents.find
      .mockImplementationOnce(async () => Result.ok(Option.some(KNOWN)))
      .mockImplementationOnce(async () =>
        Result.ok(
          Option.some({
            ...KNOWN,
            status: "failed" as const,
            lastError: Option.some("local status active, Stripe canceled"),
          }),
        ),
      );

    const result = await service.replay(replay);

    expect(result.getError().code).toBe("ADMIN_STRIPE_REPLAY_PROVIDER_FAILURE");
    expect(result.getError().message).toContain("local status active");
    expect(stripeEvents.markReplayed).not.toHaveBeenCalled();
  });
});
