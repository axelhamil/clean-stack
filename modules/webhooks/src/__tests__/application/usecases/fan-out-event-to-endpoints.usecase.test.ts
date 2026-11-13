import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IWebhookDeliveryRepository } from "../../../application/ports/repositories/webhook-delivery.port";
import type { IWebhookEndpointRepository } from "../../../application/ports/repositories/webhook-endpoint.port";
import type { FanOutEventToEndpointsInput } from "../../../application/usecases/fan-out-event-to-endpoints/fan-out-event-to-endpoints.dto";
import { FanOutEventToEndpointsUseCase } from "../../../application/usecases/fan-out-event-to-endpoints/fan-out-event-to-endpoints.usecase";
import { ORG_ID, REPO_DOWN } from "./fixtures";

const PAYLOAD = { userId: "u1" };

function event(over: Partial<FanOutEventToEndpointsInput> = {}): FanOutEventToEndpointsInput {
  return {
    eventId: "evt-1",
    eventType: EventTypes.USER_CREATED,
    organizationId: Option.some(ORG_ID),
    payload: PAYLOAD,
    ...over,
  };
}

function given() {
  const endpoints = mockPort<IWebhookEndpointRepository>();
  const deliveries = mockPort<IWebhookDeliveryRepository>();
  const uow = mockUnitOfWork();

  endpoints.listEnabledByOrg.mockResolvedValue(
    Result.ok([
      { id: "ep-exact", eventTypes: [EventTypes.USER_CREATED] },
      { id: "ep-group", eventTypes: ["user.*"] },
      { id: "ep-all", eventTypes: ["*"] },
      { id: "ep-other", eventTypes: ["organization.*"] },
    ]),
  );
  deliveries.enqueueFanout.mockResolvedValue(Result.ok());

  const useCase = new FanOutEventToEndpointsUseCase(endpoints, deliveries, uow.unitOfWork);

  return { endpoints, deliveries, uow, useCase };
}

describe("fan an event out to webhook endpoints", () => {
  let world = given();

  beforeEach(() => {
    world = given();
  });

  it("enqueues one delivery per subscribed endpoint of the organization, keyed on event and endpoint", async () => {
    const result = await world.useCase.execute(event());

    expect(result.isSuccess).toBe(true);
    expect(world.endpoints.listEnabledByOrg).toHaveBeenCalledWith(ORG_ID);
    expect(world.deliveries.enqueueFanout).toHaveBeenCalledTimes(1);
    expect(world.deliveries.enqueueFanout.mock.calls[0]?.[0]).toEqual(
      ["ep-exact", "ep-group", "ep-all"].map((endpointId) => ({
        endpointId,
        outboxEventId: "evt-1",
        eventType: EventTypes.USER_CREATED,
        payload: PAYLOAD,
        idempotencyKey: `evt-1:${endpointId}`,
      })),
    );
    expect(world.uow.outcome()).toBe("committed");
  });

  it("writes nothing when no endpoint subscribes to the event", async () => {
    world.endpoints.listEnabledByOrg.mockResolvedValue(
      Result.ok([{ id: "ep-other", eventTypes: ["organization.*"] }]),
    );

    const result = await world.useCase.execute(event());

    expect(result.isSuccess).toBe(true);
    expect(world.deliveries.enqueueFanout).not.toHaveBeenCalled();
  });

  it("ignores an event that carries no organization", async () => {
    const result = await world.useCase.execute(event({ organizationId: Option.none() }));

    expect(result.isSuccess).toBe(true);
    expect(world.endpoints.listEnabledByOrg).not.toHaveBeenCalled();
    expect(world.deliveries.enqueueFanout).not.toHaveBeenCalled();
  });

  it("ignores an internal catalog event even for an endpoint subscribed to everything", async () => {
    const result = await world.useCase.execute(
      event({ eventType: EventTypes.USER_PASSWORD_CHANGED }),
    );

    expect(result.isSuccess).toBe(true);
    expect(world.endpoints.listEnabledByOrg).not.toHaveBeenCalled();
    expect(world.deliveries.enqueueFanout).not.toHaveBeenCalled();
  });

  it("ignores an event type missing from the catalog", async () => {
    const result = await world.useCase.execute(event({ eventType: "not.in.the.catalog" }));

    expect(result.isSuccess).toBe(true);
    expect(world.deliveries.enqueueFanout).not.toHaveBeenCalled();
  });

  it("returns the lookup failure so the event is delivered again", async () => {
    world.endpoints.listEnabledByOrg.mockResolvedValue(Result.fail(REPO_DOWN));

    const result = await world.useCase.execute(event());

    expect(result.getError()).toEqual(REPO_DOWN);
    expect(world.deliveries.enqueueFanout).not.toHaveBeenCalled();
  });
});
