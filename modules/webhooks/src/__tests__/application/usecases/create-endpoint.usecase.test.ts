import { beforeEach, describe, expect, it } from "bun:test";
import { type ILogger, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IWebhookEndpointRepository } from "../../../application/ports/repositories/webhook-endpoint.port";
import type { MasterKeyProvider } from "../../../application/ports/services/master-key.port";
import type { ISecretCipher } from "../../../application/ports/services/secret-cipher.port";
import type { ISecretGenerator } from "../../../application/ports/services/secret-generator.port";
import type { IUrlGuard } from "../../../application/ports/services/url-guard.port";
import type { TestDeliveryService } from "../../../application/services/test-delivery.service";
import type { CreateEndpointInput } from "../../../application/usecases/create-endpoint/create-endpoint.dto";
import { CreateEndpointUseCase } from "../../../application/usecases/create-endpoint/create-endpoint.usecase";
import {
  ACTOR_ID,
  deliveryRecord,
  ENDPOINT_ID,
  endpointRecord,
  inTransaction,
  MASTER_KEY,
  ORG_ID,
  REPO_DOWN,
  recordingOutbox,
  sealedFor,
  sealUnderMasterKey,
} from "./fixtures";

const PLAINTEXT = "whsec_fresh";

const input: CreateEndpointInput = {
  organizationId: ORG_ID,
  actorUserId: ACTOR_ID,
  url: "https://example.com/hook",
  eventTypes: ["user.created"],
  enabled: true,
};

function given({ masterKey = Option.some(MASTER_KEY) } = {}) {
  const seen: unknown[] = [];
  const endpoints = mockPort<IWebhookEndpointRepository>();
  const testDelivery = mockPort<TestDeliveryService>();
  const outbox = recordingOutbox(seen);
  const cipher = mockPort<ISecretCipher>();
  const secretGenerator = mockPort<ISecretGenerator>();
  const urlGuard = mockPort<IUrlGuard>();
  const logger = mockPort<ILogger>();
  const instrumentation = mockInstrumentation();
  const uow = mockUnitOfWork();
  const provider: MasterKeyProvider = () => masterKey;

  endpoints.create.mockImplementation(inTransaction(seen, Result.ok(endpointRecord())));
  testDelivery.send.mockResolvedValue(Result.ok(deliveryRecord()));
  cipher.seal.mockImplementation(sealUnderMasterKey);
  secretGenerator.generate.mockReturnValue(PLAINTEXT);
  urlGuard.assertPublic.mockResolvedValue(Result.ok(new URL(input.url)));

  const useCase = new CreateEndpointUseCase(
    endpoints,
    testDelivery,
    uow.unitOfWork,
    outbox,
    provider,
    cipher,
    secretGenerator,
    urlGuard,
    logger,
    instrumentation,
  );

  return { seen, endpoints, testDelivery, outbox, urlGuard, logger, instrumentation, uow, useCase };
}

describe("create a webhook endpoint", () => {
  let world = given();

  beforeEach(() => {
    world = given();
  });

  it("seals the secret under the organization key and returns its plaintext once", async () => {
    const result = await world.useCase.execute(input);

    expect(result.getValue()).toEqual({ endpoint: endpointRecord(), plaintextSecret: PLAINTEXT });
    expect(world.endpoints.create.mock.calls[0]?.[0]).toMatchObject({
      organizationId: ORG_ID,
      url: input.url,
      secretCipher: sealedFor(PLAINTEXT, ORG_ID),
      eventTypes: ["user.created"],
      enabled: true,
    });
  });

  it("announces the creation with its actor in the same transaction as the write", async () => {
    await world.useCase.execute(input);

    expect(enqueuedEvents(world.outbox)).toEqual([
      {
        eventType: EventTypes.WEBHOOK_ENDPOINT_CREATED,
        aggregateId: ENDPOINT_ID,
        payload: {
          organizationId: ORG_ID,
          actorUserId: ACTOR_ID,
          endpointId: ENDPOINT_ID,
          url: input.url,
          eventTypes: ["user.created"],
          enabled: true,
        },
      },
    ]);
    expect(world.seen).toHaveLength(2);
    expect(world.seen[0]).toBeDefined();
    expect(world.seen[1]).toBe(world.seen[0]);
    expect(world.uow.outcome()).toBe("committed");
  });

  it("sends a first test delivery to the new endpoint on behalf of its creator", async () => {
    await world.useCase.execute(input);

    expect(world.testDelivery.send).toHaveBeenCalledWith({
      endpointId: ENDPOINT_ID,
      organizationId: ORG_ID,
      actorUserId: ACTOR_ID,
    });
  });

  it("keeps the endpoint and logs the code when its first test delivery fails", async () => {
    world.testDelivery.send.mockResolvedValue(Result.fail(REPO_DOWN));

    const result = await world.useCase.execute(input);

    expect(result.isSuccess).toBe(true);
    expect(world.logger.warn).toHaveBeenCalledWith(
      { endpointId: ENDPOINT_ID, code: REPO_DOWN.code },
      "webhook endpoint created but its test delivery failed",
    );
  });

  it("keeps the endpoint and reports to telemetry when its first test delivery throws", async () => {
    const boom = new Error("outbox down");
    world.testDelivery.send.mockRejectedValue(boom);

    const result = await world.useCase.execute(input);

    expect(result.isSuccess).toBe(true);
    expect(world.instrumentation.capture).toHaveBeenCalledWith(boom);
  });

  it("refuses a destination the URL guard forbids and writes nothing", async () => {
    world.urlGuard.assertPublic.mockResolvedValue(
      Result.fail({ code: "WEBHOOK_URL_FORBIDDEN", message: "private address" }),
    );

    const result = await world.useCase.execute({ ...input, url: "http://127.0.0.1/hook" });

    expect(result.getError()).toEqual({
      code: "WEBHOOK_URL_FORBIDDEN",
      message: "private address",
    });
    expect(world.endpoints.create).not.toHaveBeenCalled();
    expect(enqueuedEvents(world.outbox)).toEqual([]);
    expect(world.testDelivery.send).not.toHaveBeenCalled();
  });

  it("refuses with WEBHOOK_MASTER_KEY_UNAVAILABLE and writes nothing when no master key is set", async () => {
    const unconfigured = given({ masterKey: Option.none() });

    const result = await unconfigured.useCase.execute(input);

    expect(result.getError().code).toBe("WEBHOOK_MASTER_KEY_UNAVAILABLE");
    expect(unconfigured.endpoints.create).not.toHaveBeenCalled();
    expect(enqueuedEvents(unconfigured.outbox)).toEqual([]);
  });

  it("returns the write failure without announcing or testing anything", async () => {
    world.endpoints.create.mockResolvedValue(Result.fail(REPO_DOWN));

    const result = await world.useCase.execute(input);

    expect(result.getError()).toEqual(REPO_DOWN);
    expect(enqueuedEvents(world.outbox)).toEqual([]);
    expect(world.testDelivery.send).not.toHaveBeenCalled();
  });
});
