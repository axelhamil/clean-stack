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
import type { ISweepRunStore } from "../../../shared/ports/sweep-run.port";
import type { IOpsStore } from "../application/ports/ops-store.port";
import { OpsService } from "../application/services/ops.service";

const ACTOR = "staff-1";
const LEASE_SECONDS = 340;
const KNOWN: StripeEventRow = {
  id: "evt_1",
  type: "invoice.payment_failed",
  receivedAt: new Date("2026-10-30T12:00:00Z"),
  status: "processed",
  lastError: Option.none(),
  replayedAt: Option.none(),
};

function setup(given: { requeued?: string[]; known?: boolean; configured?: boolean } = {}) {
  const ops = mockPort<IOpsStore>();
  ops.requeueDead.mockImplementation(async () => Result.ok(given.requeued ?? ["a", "b"]));

  const sweeps = mockPort<ISweepRunStore>();

  const stripeEvents = mockPort<IStripeEventStore>();
  stripeEvents.find.mockImplementation(async () =>
    Result.ok(given.known === false ? Option.none() : Option.some(KNOWN)),
  );
  stripeEvents.markReplayed.mockImplementation(async () => Result.ok());
  stripeEvents.recordDelivery.mockImplementation(async () => Result.ok());

  const gateway = mockPort<IStripeEventGateway>();
  gateway.isConfigured.mockImplementation(() => given.configured ?? true);
  gateway.retrieve.mockImplementation(async () => Result.ok({ payload: "{}" }));
  gateway.redeliver.mockImplementation(async () => Result.ok());

  const outbox = mockPort<IOutboxRepository>();
  outbox.enqueue.mockImplementation(async () => {});

  const { unitOfWork } = mockUnitOfWork();
  const service = new OpsService(ops, sweeps, stripeEvents, gateway, outbox, unitOfWork, {
    OUTBOX_LEASE_SECONDS: LEASE_SECONDS,
  });

  return { service, ops, stripeEvents, gateway, outbox };
}

describe("OpsService.requeue", () => {
  it("announces one event for the staff action, naming the actor and the rows moved", async () => {
    const { service, ops, outbox } = setup();

    const result = await service.requeue({ actorUserId: ACTOR, ids: ["a", "b", "c"] });

    expect(result.getValue()).toEqual({ requeued: 2 });
    expect(ops.requeueDead).toHaveBeenCalledWith(["a", "b", "c"], LEASE_SECONDS);
    expect(enqueuedEvents(outbox)).toMatchObject([
      {
        eventType: EventTypes.ADMIN_OPS_OUTBOX_REQUEUED,
        payload: { actorUserId: ACTOR, requeued: 2, eventIds: ["a", "b"] },
      },
    ]);
  });

  it("announces nothing when no row moved", async () => {
    const { service, outbox } = setup({ requeued: [] });

    const result = await service.requeue({ actorUserId: ACTOR, ids: ["a"] });

    expect(result.getValue()).toEqual({ requeued: 0 });
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});

describe("OpsService.replay", () => {
  const handler = async () => new Response(null, { status: 200 });
  const replay = { actorUserId: ACTOR, stripeEventId: KNOWN.id, handler };

  it("answers a typed error when Stripe is not configured", async () => {
    const { service, gateway } = setup({ configured: false });

    const result = await service.replay(replay);

    expect(result.getError().code).toBe("ADMIN_STRIPE_UNAVAILABLE");
    expect(gateway.retrieve).not.toHaveBeenCalled();
  });

  it("refuses an event this platform never received", async () => {
    const { service, gateway } = setup({ known: false });

    const result = await service.replay(replay);

    expect(result.getError().code).toBe("ADMIN_STRIPE_EVENT_NOT_FOUND");
    expect(gateway.retrieve).not.toHaveBeenCalled();
  });

  it("delivers the event again and announces the replay with its actor", async () => {
    const { service, stripeEvents, gateway, outbox } = setup();

    const result = await service.replay(replay);

    expect(result.isSuccess).toBe(true);
    expect(gateway.redeliver).toHaveBeenCalledWith({ payload: "{}" }, handler);
    expect(stripeEvents.markReplayed).toHaveBeenCalledWith(KNOWN.id);
    expect(enqueuedEvents(outbox)).toMatchObject([
      {
        eventType: EventTypes.ADMIN_OPS_STRIPE_EVENT_REPLAYED,
        payload: { actorUserId: ACTOR, stripeEventId: KNOWN.id, stripeEventType: KNOWN.type },
      },
    ]);
  });

  it("stores why a refused delivery failed, once the unit rolled back", async () => {
    const { service, stripeEvents, gateway } = setup();
    gateway.redeliver.mockImplementation(async () =>
      Result.fail({ code: "ADMIN_STRIPE_PROVIDER_FAILURE", message: "handler answered 400" }),
    );

    const result = await service.replay(replay);

    expect(result.getError().code).toBe("ADMIN_STRIPE_PROVIDER_FAILURE");
    expect(stripeEvents.recordDelivery).toHaveBeenCalledWith({
      id: KNOWN.id,
      type: KNOWN.type,
      lastError: Option.some("handler answered 400"),
    });
  });
});
