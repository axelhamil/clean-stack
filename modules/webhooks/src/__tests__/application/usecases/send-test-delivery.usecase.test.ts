import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IWebhookDeliveryRepository } from "../../../application/ports/repositories/webhook-delivery.port";
import type { IWebhookEndpointRepository } from "../../../application/ports/repositories/webhook-endpoint.port";
import { TestDeliveryService } from "../../../application/services/test-delivery.service";
import { SendTestDeliveryUseCase } from "../../../application/usecases/send-test-delivery/send-test-delivery.usecase";
import {
  ACTOR_ID,
  deliveryRecord,
  ENDPOINT_ID,
  endpointRecord,
  inTransaction,
  ORG_ID,
  REPO_DOWN,
  recordingOutbox,
} from "./fixtures";

const target = { id: ENDPOINT_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID };
const testPayload = { organizationId: ORG_ID, endpointId: ENDPOINT_ID, actorUserId: ACTOR_ID };
const queued = deliveryRecord({
  id: "del-test",
  eventType: EventTypes.WEBHOOK_TEST,
  status: "pending",
});

function given() {
  const seen: unknown[] = [];
  const endpoints = mockPort<IWebhookEndpointRepository>();
  const deliveries = mockPort<IWebhookDeliveryRepository>();
  const outbox = recordingOutbox(seen);
  const uow = mockUnitOfWork();

  endpoints.findById.mockResolvedValue(Result.ok(Option.some(endpointRecord())));
  deliveries.enqueueTargeted.mockImplementation(inTransaction(seen, Result.ok(queued)));

  const service = new TestDeliveryService(endpoints, deliveries, uow.unitOfWork, outbox);
  const useCase = new SendTestDeliveryUseCase(service);

  function emittedEventId(): string | undefined {
    return outbox.enqueue.mock.calls[0]?.[0][0]?.eventId;
  }

  return { seen, endpoints, deliveries, outbox, uow, useCase, emittedEventId };
}

describe("send a test delivery", () => {
  let world = given();

  beforeEach(() => {
    world = given();
  });

  it("announces the test with its actor and enqueues a delivery keyed on that event", async () => {
    const result = await world.useCase.execute(target);

    const eventId = world.emittedEventId();
    expect(eventId).toBeDefined();
    expect(result.getValue()).toEqual(queued);
    expect(enqueuedEvents(world.outbox)).toEqual([
      { eventType: EventTypes.WEBHOOK_TEST, aggregateId: ENDPOINT_ID, payload: testPayload },
    ]);
    expect(world.deliveries.enqueueTargeted).toHaveBeenCalledWith({
      endpointId: ENDPOINT_ID,
      outboxEventId: eventId,
      eventType: EventTypes.WEBHOOK_TEST,
      payload: testPayload,
      idempotencyKey: `test:${eventId}`,
    });
  });

  it("writes the event and the delivery in the same transaction", async () => {
    await world.useCase.execute(target);

    expect(world.seen).toHaveLength(2);
    expect(world.seen[0]).toBeDefined();
    expect(world.seen[1]).toBe(world.seen[0]);
    expect(world.uow.outcome()).toBe("committed");
  });

  it("reports an endpoint absent from the organization as not found and writes nothing", async () => {
    world.endpoints.findById.mockResolvedValue(Result.ok(Option.none()));

    const result = await world.useCase.execute(target);

    expect(result.getError().code).toBe("WEBHOOK_ENDPOINT_NOT_FOUND");
    expect(world.deliveries.enqueueTargeted).not.toHaveBeenCalled();
    expect(enqueuedEvents(world.outbox)).toEqual([]);
  });

  it("returns the lookup failure without writing", async () => {
    world.endpoints.findById.mockResolvedValue(Result.fail(REPO_DOWN));

    const result = await world.useCase.execute(target);

    expect(result.getError()).toEqual(REPO_DOWN);
    expect(world.deliveries.enqueueTargeted).not.toHaveBeenCalled();
  });

  it("rolls back the announced test when the delivery cannot be enqueued", async () => {
    world.deliveries.enqueueTargeted.mockResolvedValue(Result.fail(REPO_DOWN));

    const result = await world.useCase.execute(target);

    expect(result.getError()).toEqual(REPO_DOWN);
    expect(world.uow.outcome()).toBe("rolled_back");
  });
});
