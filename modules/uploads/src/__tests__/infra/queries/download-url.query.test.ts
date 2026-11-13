import { describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import type { IStorageService } from "../../../application/ports/services/storage.port";
import { StorageDownloadUrlQuery } from "../../../infra/queries/download-url.query";

const OWNER = "user-1";
const KEY = `${OWNER}/avatars/uuid-photo.png`;
const SETTINGS = { maxUploadBytes: 1024, presignTtlMinSeconds: 60, presignTtlMaxSeconds: 3600 };

function given() {
  const storage = mockPort<IStorageService>();
  storage.presignDownload.mockResolvedValue(Result.ok({ url: "get", expiresAt: "soon" }));
  const query = new StorageDownloadUrlQuery(storage, SETTINGS);

  return { storage, query };
}

describe("download url of an upload", () => {
  it("issues a url for an owned key", async () => {
    const { query } = given();

    const result = await query.execute({ ownerId: OWNER, key: KEY, expiresInSeconds: 300 });

    expect(result.getValue()).toEqual({ url: "get", expiresAt: "soon" });
  });

  it("refuses a key of another owner", async () => {
    const { storage, query } = given();

    const result = await query.execute({
      ownerId: OWNER,
      key: "user-2/avatars/a.png",
      expiresInSeconds: 300,
    });

    expect(result.getError().code).toBe("STORAGE_FORBIDDEN");
    expect(storage.presignDownload).not.toHaveBeenCalled();
  });

  it("clamps the requested lifetime into the configured bounds", async () => {
    const { storage, query } = given();

    await query.execute({ ownerId: OWNER, key: KEY, expiresInSeconds: 1 });
    await query.execute({ ownerId: OWNER, key: KEY, expiresInSeconds: 99_999 });

    const lifetimes = storage.presignDownload.mock.calls.map(([input]) => input.expiresInSeconds);
    expect(lifetimes).toEqual([60, 3600]);
  });

  it("fails with the storage error when presigning fails", async () => {
    const { storage, query } = given();
    storage.presignDownload.mockResolvedValue(
      Result.fail({ code: "STORAGE_PROVIDER_FAILURE", message: "unreachable" }),
    );

    const result = await query.execute({ ownerId: OWNER, key: KEY, expiresInSeconds: 300 });

    expect(result.getError().code).toBe("STORAGE_PROVIDER_FAILURE");
  });
});
