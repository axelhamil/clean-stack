import { describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { ISweepRunStore } from "../../../shared/ports/sweep-run.port";
import type { IOpsStore } from "../application/ports/ops-store.port";
import { OpsService } from "../application/services/ops.service";

const ACTOR = "staff-1";
const LEASE_SECONDS = 340;
const DAY_MS = 24 * 60 * 60 * 1000;

function setup(given: { requeued?: string[] } = {}) {
  const ops = mockPort<IOpsStore>();
  const sweeps = mockPort<ISweepRunStore>();

  const outbox = mockPort<IOutboxRepository>();
  outbox.enqueue.mockImplementation(async () => {});
  outbox.requeueDead.mockImplementation(async () => Result.ok(given.requeued ?? ["a", "b"]));

  const { unitOfWork } = mockUnitOfWork();
  const service = new OpsService(ops, sweeps, outbox, unitOfWork, {
    OUTBOX_LEASE_SECONDS: LEASE_SECONDS,
  });

  return { service, sweeps, outbox };
}

describe("OpsService.requeue", () => {
  it("announces one event for the staff action, naming the actor and the rows moved", async () => {
    const { service, outbox } = setup();

    const result = await service.requeue({ actorUserId: ACTOR, ids: ["a", "b", "c"] });

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
    const { service, outbox } = setup({ requeued: [] });

    const result = await service.requeue({ actorUserId: ACTOR, ids: ["a"] });

    expect(result.getValue()).toEqual({ requeued: 0 });
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("answers a typed failure when the outbox refuses", async () => {
    const { service, outbox } = setup();
    outbox.requeueDead.mockImplementation(async () => Result.fail("outbox_unavailable: down"));

    const result = await service.requeue({ actorUserId: ACTOR, ids: ["a"] });

    expect(result.getError().code).toBe("ADMIN_OPS_PROVIDER_FAILURE");
  });
});

describe("OpsService.sweeps", () => {
  it("derives a late job from its last finish, whatever that run reported", async () => {
    const { service, sweeps } = setup();
    const at = new Date(Date.now() - 2 * DAY_MS);
    sweeps.list.mockImplementation(async () =>
      Result.ok([
        { label: "sweep-x", outcome: "ok", startedAt: at, finishedAt: at, durationMs: 1, count: 0 },
      ]),
    );

    const runs = (await service.sweeps()).getValue();

    expect(runs[0]?.late).toBe(true);
  });
});
