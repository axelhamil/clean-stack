import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IWebhookDeliveryRepository } from "../../../application/ports/repositories/webhook-delivery.port";
import type { IWebhookEndpointRepository } from "../../../application/ports/repositories/webhook-endpoint.port";
import { ReplayDeliveryUseCase } from "../../../application/usecases/replay-delivery/replay-delivery.usecase";
import {
  ACTOR_ID,
  DELIVERY_ID,
  deliveryRecord,
  ENDPOINT_ID,
  endpointRecord,
  inTransaction,
  ORG_ID,
  REPO_DOWN,
  recordingOutbox,
} from "./fixtures";

const replay = deliveryRecord({ id: "del-replay", status: "pending", attempts: 0 });
const request = {
  deliveryId: DELIVERY_ID,
  endpointId: ENDPOINT_ID,
  organizationId: ORG_ID,
  actorUserId: ACTOR_ID,
};

function given() {
  const seen: unknown[] = [];
  const endpoints = mockPort<IWebhookEndpointRepository>();
  const deliveries = mockPort<IWebhookDeliveryRepository>();
  const outbox = recordingOutbox(seen);
  const uow = mockUnitOfWork();

  endpoints.findById.mockResolvedValue(Result.ok(Option.some(endpointRecord())));
  deliveries.enqueueReplay.mockImplementation(inTransaction(seen, Result.ok(Option.some(replay))));

  const useCase = new ReplayDeliveryUseCase(endpoints, deliveries, uow.unitOfWork, outbox);

  return { seen, endpoints, deliveries, outbox, uow, useCase };
}

describe("replay a webhook delivery", () => {
  let world = given();

  beforeEach(() => {
    world = given();
  });

  it("enqueues a copy of the delivery and announces it with its actor in the same transaction", async () => {
    const result = await world.useCase.execute(request);

    expect(result.getValue()).toEqual(replay);
    expect(world.deliveries.enqueueReplay).toHaveBeenCalledWith(DELIVERY_ID, ENDPOINT_ID, ORG_ID);
    expect(enqueuedEvents(world.outbox)).toEqual([
      {
        eventType: EventTypes.WEBHOOK_DELIVERY_REPLAYED,
        aggregateId: DELIVERY_ID,
        payload: {
          organizationId: ORG_ID,
          endpointId: ENDPOINT_ID,
          deliveryId: DELIVERY_ID,
          replayedDeliveryId: "del-replay",
          actorUserId: ACTOR_ID,
        },
      },
    ]);
    expect(world.seen).toHaveLength(2);
    expect(world.seen[0]).toBeDefined();
    expect(world.seen[1]).toBe(world.seen[0]);
    expect(world.uow.outcome()).toBe("committed");
  });

  it("reports an endpoint absent from the organization as endpoint not found and enqueues nothing", async () => {
    world.endpoints.findById.mockResolvedValue(Result.ok(Option.none()));

    const result = await world.useCase.execute(request);

    expect(result.getError().code).toBe("WEBHOOK_ENDPOINT_NOT_FOUND");
    expect(world.deliveries.enqueueReplay).not.toHaveBeenCalled();
    expect(enqueuedEvents(world.outbox)).toEqual([]);
  });

  it("reports a delivery absent from that endpoint as delivery not found without announcing", async () => {
    world.deliveries.enqueueReplay.mockResolvedValue(Result.ok(Option.none()));

    const result = await world.useCase.execute(request);

    expect(result.getError().code).toBe("WEBHOOK_DELIVERY_NOT_FOUND");
    expect(enqueuedEvents(world.outbox)).toEqual([]);
  });

  it("returns the write failure without announcing", async () => {
    world.deliveries.enqueueReplay.mockResolvedValue(Result.fail(REPO_DOWN));

    const result = await world.useCase.execute(request);

    expect(result.getError()).toEqual(REPO_DOWN);
    expect(enqueuedEvents(world.outbox)).toEqual([]);
  });
});
