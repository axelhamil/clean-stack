import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort } from "@packages/test/bun";
import type { IStorageService } from "../../../application/ports/services/storage.port";
import { DeleteUploadUseCase } from "../../../application/usecases/delete-upload/delete-upload.usecase";

const OWNER = "user-1";
const KEY = `${OWNER}/avatars/uuid-photo.png`;

function hashed(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

function given() {
  const storage = mockPort<IStorageService>();
  const outbox = mockPort<IOutboxRepository>();
  storage.deleteObject.mockResolvedValue(Result.ok());
  storage.keyFromPublicUrl.mockImplementation((url: string) =>
    url.startsWith("cdn/") ? Option.some(url.slice(4)) : Option.none(),
  );
  outbox.enqueue.mockResolvedValue(undefined);
  const useCase = new DeleteUploadUseCase(storage, outbox);

  return { storage, outbox, useCase };
}

const deletion = {
  eventType: EventTypes.UPLOAD_DELETED,
  aggregateId: hashed(KEY),
  payload: { userId: OWNER, key: hashed(KEY) },
};

describe("delete an upload", () => {
  it("deletes an owned key and announces it hashed", async () => {
    const { storage, outbox, useCase } = given();

    const result = await useCase.execute({ ownerId: OWNER, key: KEY });

    expect(result.getValue()).toEqual({ deleted: true });
    expect(storage.deleteObject).toHaveBeenCalledWith(KEY);
    expect(enqueuedEvents(outbox)).toEqual([deletion]);
  });

  it("deletes the key behind a public url this storage produced", async () => {
    const { storage, outbox, useCase } = given();

    const result = await useCase.execute({ ownerId: OWNER, url: `cdn/${KEY}` });

    expect(result.getValue()).toEqual({ deleted: true });
    expect(storage.deleteObject).toHaveBeenCalledWith(KEY);
    expect(enqueuedEvents(outbox)).toEqual([deletion]);
  });

  it("does nothing for a url this storage did not produce", async () => {
    const { storage, outbox, useCase } = given();

    const result = await useCase.execute({ ownerId: OWNER, url: "https://elsewhere/a.png" });

    expect(result.getValue()).toEqual({ deleted: false });
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("refuses a key or a url of another owner", async () => {
    const { storage, outbox, useCase } = given();

    const byKey = await useCase.execute({ ownerId: OWNER, key: "user-2/avatars/a.png" });
    const byUrl = await useCase.execute({ ownerId: OWNER, url: "cdn/user-2/avatars/a.png" });

    expect([byKey.getError().code, byUrl.getError().code]).toEqual([
      "STORAGE_FORBIDDEN",
      "STORAGE_FORBIDDEN",
    ]);
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("fails with the storage error and announces nothing when the deletion fails", async () => {
    const { storage, outbox, useCase } = given();
    storage.deleteObject.mockResolvedValue(
      Result.fail({ code: "STORAGE_PROVIDER_FAILURE", message: "unreachable" }),
    );

    const result = await useCase.execute({ ownerId: OWNER, key: KEY });

    expect(result.getError().code).toBe("STORAGE_PROVIDER_FAILURE");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});
