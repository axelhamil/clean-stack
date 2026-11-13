import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IWebhookEndpointRepository } from "../../../application/ports/repositories/webhook-endpoint.port";
import type { IUrlGuard } from "../../../application/ports/services/url-guard.port";
import type { UpdateEndpointInput } from "../../../application/usecases/update-endpoint/update-endpoint.dto";
import { UpdateEndpointUseCase } from "../../../application/usecases/update-endpoint/update-endpoint.usecase";
import {
  ACTOR_ID,
  ENDPOINT_ID,
  endpointRecord,
  inTransaction,
  ORG_ID,
  REPO_DOWN,
  recordingOutbox,
} from "./fixtures";

const target = { id: ENDPOINT_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID };

function given() {
  const seen: unknown[] = [];
  const endpoints = mockPort<IWebhookEndpointRepository>();
  const outbox = recordingOutbox(seen);
  const urlGuard = mockPort<IUrlGuard>();
  const uow = mockUnitOfWork();

  endpoints.update.mockImplementation(
    inTransaction(seen, Result.ok(Option.some(endpointRecord({ enabled: false })))),
  );
  urlGuard.assertPublic.mockImplementation(async (url) => Result.ok(new URL(url)));

  const useCase = new UpdateEndpointUseCase(endpoints, uow.unitOfWork, outbox, urlGuard);
  const update = (over: Partial<UpdateEndpointInput>) => useCase.execute({ ...target, ...over });

  return { seen, endpoints, outbox, urlGuard, uow, update };
}

describe("update a webhook endpoint", () => {
  let world = given();

  beforeEach(() => {
    world = given();
  });

  it("returns the updated endpoint and announces only the changed fields in the same transaction", async () => {
    const result = await world.update({ enabled: false });

    expect(result.getValue()).toEqual(endpointRecord({ enabled: false }));
    expect(enqueuedEvents(world.outbox)).toEqual([
      {
        eventType: EventTypes.WEBHOOK_ENDPOINT_UPDATED,
        aggregateId: ENDPOINT_ID,
        payload: {
          organizationId: ORG_ID,
          actorUserId: ACTOR_ID,
          endpointId: ENDPOINT_ID,
          changes: { enabled: false },
        },
      },
    ]);
    expect(world.seen).toHaveLength(2);
    expect(world.seen[0]).toBeDefined();
    expect(world.seen[1]).toBe(world.seen[0]);
    expect(world.uow.outcome()).toBe("committed");
  });

  it("checks a new URL against the guard and announces it", async () => {
    await world.update({ url: "https://example.org/new" });

    expect(world.urlGuard.assertPublic).toHaveBeenCalledWith("https://example.org/new");
    expect(enqueuedEvents(world.outbox)[0]?.payload).toMatchObject({
      changes: { url: "https://example.org/new" },
    });
  });

  it("skips the URL guard when the URL is left unchanged", async () => {
    const result = await world.update({ enabled: true });

    expect(result.isSuccess).toBe(true);
    expect(world.urlGuard.assertPublic).not.toHaveBeenCalled();
  });

  it("refuses a destination the URL guard forbids and writes nothing", async () => {
    world.urlGuard.assertPublic.mockResolvedValue(
      Result.fail({ code: "WEBHOOK_URL_FORBIDDEN", message: "private address" }),
    );

    const result = await world.update({ url: "http://192.168.1.1/hook" });

    expect(result.getError()).toEqual({
      code: "WEBHOOK_URL_FORBIDDEN",
      message: "private address",
    });
    expect(world.endpoints.update).not.toHaveBeenCalled();
    expect(enqueuedEvents(world.outbox)).toEqual([]);
  });

  it("reports an endpoint absent from the organization as not found without announcing", async () => {
    world.endpoints.update.mockResolvedValue(Result.ok(Option.none()));

    const result = await world.update({ enabled: true });

    expect(result.getError().code).toBe("WEBHOOK_ENDPOINT_NOT_FOUND");
    expect(enqueuedEvents(world.outbox)).toEqual([]);
  });

  it("returns the write failure without announcing", async () => {
    world.endpoints.update.mockResolvedValue(Result.fail(REPO_DOWN));

    const result = await world.update({ enabled: true });

    expect(result.getError()).toEqual(REPO_DOWN);
    expect(enqueuedEvents(world.outbox)).toEqual([]);
  });
});
