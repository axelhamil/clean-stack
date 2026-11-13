import { afterEach, beforeEach, describe, expect, it, setSystemTime } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IWebhookEndpointRepository } from "../../../application/ports/repositories/webhook-endpoint.port";
import type { MasterKeyProvider } from "../../../application/ports/services/master-key.port";
import type { ISecretCipher } from "../../../application/ports/services/secret-cipher.port";
import type { ISecretGenerator } from "../../../application/ports/services/secret-generator.port";
import { RotateEndpointSecretUseCase } from "../../../application/usecases/rotate-endpoint-secret/rotate-endpoint-secret.usecase";
import {
  ACTOR_ID,
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

const NOW = new Date("2026-06-01T12:00:00Z");
const GRACE_HOURS = 24;
const PLAINTEXT = "whsec_rotated";
const target = { id: ENDPOINT_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID };
const rotatedEndpoint = endpointRecord({
  secretCipher: sealedFor(PLAINTEXT, ORG_ID),
  previousSecretCipher: Option.some("sealed-current"),
});

function given({ masterKey = Option.some(MASTER_KEY) } = {}) {
  const seen: unknown[] = [];
  const endpoints = mockPort<IWebhookEndpointRepository>();
  const outbox = recordingOutbox(seen);
  const cipher = mockPort<ISecretCipher>();
  const secretGenerator = mockPort<ISecretGenerator>();
  const uow = mockUnitOfWork();
  const provider: MasterKeyProvider = () => masterKey;

  endpoints.findById.mockResolvedValue(Result.ok(Option.some(endpointRecord())));
  endpoints.applySecretRotation.mockImplementation(
    inTransaction(seen, Result.ok(Option.some(rotatedEndpoint))),
  );
  cipher.seal.mockImplementation(sealUnderMasterKey);
  secretGenerator.generate.mockReturnValue(PLAINTEXT);

  const useCase = new RotateEndpointSecretUseCase(
    endpoints,
    uow.unitOfWork,
    outbox,
    provider,
    cipher,
    secretGenerator,
    { secretGraceHours: GRACE_HOURS },
  );

  return { seen, endpoints, outbox, uow, useCase };
}

describe("rotate a webhook endpoint secret", () => {
  let world = given();

  beforeEach(() => {
    setSystemTime(NOW);
    world = given();
  });

  afterEach(() => setSystemTime());

  it("seals a new secret and keeps the current one valid for the grace period", async () => {
    const result = await world.useCase.execute(target);

    expect(result.getValue()).toEqual({ endpoint: rotatedEndpoint, plaintextSecret: PLAINTEXT });
    expect(world.endpoints.applySecretRotation).toHaveBeenCalledWith({
      id: ENDPOINT_ID,
      organizationId: ORG_ID,
      secretCipher: sealedFor(PLAINTEXT, ORG_ID),
      previousSecretCipher: "sealed-current",
      previousSecretExpiresAt: new Date(NOW.getTime() + GRACE_HOURS * 3_600_000),
    });
  });

  it("announces the rotation with its actor in the same transaction as the write", async () => {
    await world.useCase.execute(target);

    expect(enqueuedEvents(world.outbox)).toEqual([
      {
        eventType: EventTypes.WEBHOOK_ENDPOINT_SECRET_ROTATED,
        aggregateId: ENDPOINT_ID,
        payload: { organizationId: ORG_ID, endpointId: ENDPOINT_ID, actorUserId: ACTOR_ID },
      },
    ]);
    expect(world.seen).toHaveLength(2);
    expect(world.seen[0]).toBeDefined();
    expect(world.seen[1]).toBe(world.seen[0]);
    expect(world.uow.outcome()).toBe("committed");
  });

  it("refuses with WEBHOOK_MASTER_KEY_UNAVAILABLE and writes nothing when no master key is set", async () => {
    const unconfigured = given({ masterKey: Option.none() });

    const result = await unconfigured.useCase.execute(target);

    expect(result.getError().code).toBe("WEBHOOK_MASTER_KEY_UNAVAILABLE");
    expect(unconfigured.endpoints.applySecretRotation).not.toHaveBeenCalled();
    expect(enqueuedEvents(unconfigured.outbox)).toEqual([]);
  });

  it("reports an endpoint absent from the organization as not found and writes nothing", async () => {
    world.endpoints.findById.mockResolvedValue(Result.ok(Option.none()));

    const result = await world.useCase.execute(target);

    expect(result.getError().code).toBe("WEBHOOK_ENDPOINT_NOT_FOUND");
    expect(world.endpoints.applySecretRotation).not.toHaveBeenCalled();
    expect(enqueuedEvents(world.outbox)).toEqual([]);
  });

  it("reports an endpoint deleted before the rotation was written as not found", async () => {
    world.endpoints.applySecretRotation.mockResolvedValue(Result.ok(Option.none()));

    const result = await world.useCase.execute(target);

    expect(result.getError().code).toBe("WEBHOOK_ENDPOINT_NOT_FOUND");
  });

  it("returns the lookup failure without writing", async () => {
    world.endpoints.findById.mockResolvedValue(Result.fail(REPO_DOWN));

    const result = await world.useCase.execute(target);

    expect(result.getError()).toEqual(REPO_DOWN);
    expect(world.endpoints.applySecretRotation).not.toHaveBeenCalled();
  });
});
