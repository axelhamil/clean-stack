import { describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { RequeueOutboxUseCase } from "../../../application/usecases/requeue-outbox/requeue-outbox.usecase";

const ACTOR = "staff-1";
const LEASE_SECONDS = 340;

function setup(given: { requeued?: string[] } = {}) {
  const outbox = mockPort<IOutboxRepository>();
  outbox.enqueue.mockImplementation(async () => {});
  outbox.requeueDead.mockImplementation(async () => Result.ok(given.requeued ?? ["a", "b"]));

  const { unitOfWork } = mockUnitOfWork();
  const useCase = new RequeueOutboxUseCase(outbox, unitOfWork, {
    OUTBOX_LEASE_SECONDS: LEASE_SECONDS,
  });

  return { useCase, outbox };
}

describe("RequeueOutboxUseCase", () => {
  it("announces one event for the staff action, naming the actor and the rows moved", async () => {
    const { useCase, outbox } = setup();

    const result = await useCase.execute({ actorUserId: ACTOR, ids: ["a", "b", "c"] });

    expect(result.getValue()).toEqual({ requeued: 2 });
    expect(outbox.requeueDead).toHaveBeenCalledWith(["a", "b", "c"], LEASE_SECONDS);
    expect(enqueuedEvents(outbox)).toMatchObject([
      {
        eventType: EventTypes.ADMIN_OPS_OUTBOX_REQUEUED,
        payload: { actorUserId: ACTOR, requeued: 2, eventIds: ["a", "b"] },
      },
    ]);
  });

  it("announces nothing when no row moved", async () => {
    const { useCase, outbox } = setup({ requeued: [] });

    const result = await useCase.execute({ actorUserId: ACTOR, ids: ["a"] });

    expect(result.getValue()).toEqual({ requeued: 0 });
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("answers a typed failure when the outbox refuses", async () => {
    const { useCase, outbox } = setup();
    outbox.requeueDead.mockImplementation(async () => Result.fail("outbox_unavailable: down"));

    const result = await useCase.execute({ actorUserId: ACTOR, ids: ["a"] });

    expect(result.getError().code).toBe("ADMIN_OPS_PROVIDER_FAILURE");
  });
});
