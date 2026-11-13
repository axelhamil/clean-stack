import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import type { IStorageService } from "../../../application/ports/services/storage.port";
import { CreateUploadUrlUseCase } from "../../../application/usecases/create-upload-url/create-upload-url.usecase";

const OWNER = "user-1";
const SETTINGS = { maxUploadBytes: 1024, presignTtlMinSeconds: 60, presignTtlMaxSeconds: 3600 };
const REQUEST = {
  ownerId: OWNER,
  filename: "a.png",
  contentType: "image/png",
  size: 10,
  scope: "avatars",
  expiresInSeconds: 300,
};

function hashed(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

function given() {
  const storage = mockPort<IStorageService>();
  const outbox = mockPort<IOutboxRepository>();
  storage.presignUpload.mockResolvedValue(Result.ok({ url: "put", expiresAt: "soon" }));
  storage.publicUrlFor.mockImplementation((key: string) => `cdn/${key}`);
  outbox.enqueue.mockResolvedValue(undefined);
  const useCase = new CreateUploadUrlUseCase(storage, outbox, SETTINGS);

  return { storage, outbox, useCase };
}

describe("create an upload url", () => {
  it("issues a url for a key under the owner and scope, announced hashed", async () => {
    const { outbox, useCase } = given();

    const result = await useCase.execute(REQUEST);

    const output = result.getValue();
    expect(output.key).toMatch(/^user-1\/avatars\/[0-9a-f-]{36}-a\.png$/);
    expect(output).toEqual({
      url: "put",
      key: output.key,
      publicUrl: `cdn/${output.key}`,
      expiresAt: "soon",
      expectedSize: 10,
      expectedContentType: "image/png",
    });
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.UPLOAD_REQUESTED,
        aggregateId: hashed(output.key),
        payload: { userId: OWNER, key: hashed(output.key), contentType: "image/png", size: 10 },
      },
    ]);
  });

  it("clamps the requested lifetime into the configured bounds", async () => {
    const { storage, useCase } = given();

    await useCase.execute({ ...REQUEST, expiresInSeconds: 1 });
    await useCase.execute({ ...REQUEST, expiresInSeconds: 99_999 });

    const lifetimes = storage.presignUpload.mock.calls.map(([input]) => input.expiresInSeconds);
    expect(lifetimes).toEqual([60, 3600]);
  });

  it("fails with the storage error and announces nothing when presigning fails", async () => {
    const { storage, outbox, useCase } = given();
    storage.presignUpload.mockResolvedValue(
      Result.fail({ code: "STORAGE_PROVIDER_FAILURE", message: "unreachable" }),
    );

    const result = await useCase.execute(REQUEST);

    expect(result.getError().code).toBe("STORAGE_PROVIDER_FAILURE");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});
