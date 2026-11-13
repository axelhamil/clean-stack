import { beforeEach, describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IWebhookEndpointRepository } from "../../../application/ports/repositories/webhook-endpoint.port";
import { DeleteEndpointUseCase } from "../../../application/usecases/delete-endpoint/delete-endpoint.usecase";
import { ACTOR_ID, ENDPOINT_ID, inTransaction, ORG_ID, recordingOutbox } from "./fixtures";

const target = { id: ENDPOINT_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID };

function given() {
  const seen: unknown[] = [];
  const endpoints = mockPort<IWebhookEndpointRepository>();
  const outbox = recordingOutbox(seen);
  const uow = mockUnitOfWork();
  endpoints.delete.mockImplementation(inTransaction(seen, Result.ok(true)));

  const useCase = new DeleteEndpointUseCase(endpoints, uow.unitOfWork, outbox);

  return { seen, endpoints, outbox, uow, useCase };
}

describe("delete a webhook endpoint", () => {
  let world = given();

  beforeEach(() => {
    world = given();
  });

  it("deletes the endpoint scoped to its organization and announces it in the same transaction", async () => {
    const result = await world.useCase.execute(target);

    expect(result.isSuccess).toBe(true);
    expect(world.endpoints.delete).toHaveBeenCalledWith(ENDPOINT_ID, ORG_ID);
    expect(enqueuedEvents(world.outbox)).toEqual([
      {
        eventType: EventTypes.WEBHOOK_ENDPOINT_DELETED,
        aggregateId: ENDPOINT_ID,
        payload: { organizationId: ORG_ID, actorUserId: ACTOR_ID, endpointId: ENDPOINT_ID },
      },
    ]);
    expect(world.seen).toHaveLength(2);
    expect(world.seen[0]).toBeDefined();
    expect(world.seen[1]).toBe(world.seen[0]);
    expect(world.uow.outcome()).toBe("committed");
  });

  it("reports an endpoint absent from the organization as not found without announcing", async () => {
    world.endpoints.delete.mockResolvedValue(Result.ok(false));

    const result = await world.useCase.execute(target);

    expect(result.getError().code).toBe("WEBHOOK_ENDPOINT_NOT_FOUND");
    expect(enqueuedEvents(world.outbox)).toEqual([]);
  });
});
