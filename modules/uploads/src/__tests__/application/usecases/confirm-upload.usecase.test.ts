import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import type { IStorageService } from "../../../application/ports/services/storage.port";
import { ConfirmUploadUseCase } from "../../../application/usecases/confirm-upload/confirm-upload.usecase";

const OWNER = "user-1";
const KEY = `${OWNER}/avatars/uuid-photo.png`;
const REQUEST = { ownerId: OWNER, key: KEY, expectedSize: 20, expectedContentType: "image/png" };

function hashed(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

function given(stored = { size: 10, contentType: "image/png" }) {
  const storage = mockPort<IStorageService>();
  const outbox = mockPort<IOutboxRepository>();
  storage.headObject.mockResolvedValue(Result.ok(stored));
  storage.deleteObject.mockResolvedValue(Result.ok());
  storage.publicUrlFor.mockImplementation((key: string) => `cdn/${key}`);
  outbox.enqueue.mockResolvedValue(undefined);
  const useCase = new ConfirmUploadUseCase(storage, outbox);

  return { storage, outbox, useCase };
}

describe("confirm an upload", () => {
  it("confirms the stored object and announces it with its observed size and type", async () => {
    const { outbox, useCase } = given();

    const result = await useCase.execute(REQUEST);

    expect(result.getValue()).toEqual({
      key: KEY,
      size: 10,
      contentType: "image/png",
      publicUrl: `cdn/${KEY}`,
    });
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.UPLOAD_CONFIRMED,
        aggregateId: hashed(KEY),
        payload: { userId: OWNER, key: hashed(KEY), size: 10, contentType: "image/png" },
      },
    ]);
  });

  it("refuses a key of another owner without reading the storage", async () => {
    const { storage, outbox, useCase } = given();

    const result = await useCase.execute({ ...REQUEST, key: "user-2/avatars/a.png" });

    expect(result.getError().code).toBe("STORAGE_FORBIDDEN");
    expect(storage.headObject).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("deletes an object larger than declared and announces nothing", async () => {
    const { storage, outbox, useCase } = given({ size: 21, contentType: "image/png" });

    const result = await useCase.execute(REQUEST);

    expect(result.getError().code).toBe("STORAGE_INTEGRITY_FAILED");
    expect(storage.deleteObject).toHaveBeenCalledWith(KEY);
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("deletes an object of another content type than declared", async () => {
    const { storage, useCase } = given({ size: 10, contentType: "application/pdf" });

    const result = await useCase.execute(REQUEST);

    expect(result.getError().code).toBe("STORAGE_INTEGRITY_FAILED");
    expect(storage.deleteObject).toHaveBeenCalledWith(KEY);
  });

  it("fails with the storage error when the object cannot be read", async () => {
    const { storage, outbox, useCase } = given();
    storage.headObject.mockResolvedValue(
      Result.fail({ code: "STORAGE_NOT_FOUND", message: "missing" }),
    );

    const result = await useCase.execute(REQUEST);

    expect(result.getError().code).toBe("STORAGE_NOT_FOUND");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});
