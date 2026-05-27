import { describe, expect, it, mock, spyOn } from "bun:test";
import { Result } from "@packages/ddd-kit";
import type { IOutboxRepository } from "../../../shared/ports/outbox.port";
import type {
  IStorageService,
  ObjectMetadata,
  PresignedUrl,
  StorageError,
} from "../../../shared/ports/storage.port";
import { NoOpInstrumentation } from "../../../shared/services/noop-instrumentation";
import { UploadService } from "../application/services/upload.service";

// ─── stubs ──────────────────────────────────────────────────────────────────

const OWNER_ID = "user-1";
const SCOPE = "avatars";
const FILENAME = "photo.jpg";
const CONTENT_TYPE = "image/jpeg";
const SIZE = 1024;

const stubPresignedUrl: PresignedUrl = {
  url: "https://s3.example.com/presigned",
  expiresAt: "2099-01-01T00:00:00Z",
};

const stubMeta: ObjectMetadata = {
  size: SIZE,
  contentType: CONTENT_TYPE,
};

const noopOutbox: IOutboxRepository = {
  enqueue: mock(async () => {}),
  findPendingBatch: mock(async () => []),
  markDispatched: mock(async () => {}),
  markFailed: mock(async () => {}),
};

function makeStorage(overrides: Partial<IStorageService> = {}): IStorageService {
  return {
    presignUpload: mock(async () => Result.ok<PresignedUrl, StorageError>(stubPresignedUrl)),
    presignDownload: mock(async () => Result.ok<PresignedUrl, StorageError>(stubPresignedUrl)),
    headBucket: mock(async () => Result.ok<void, StorageError>()),
    headObject: mock(async () => Result.ok<ObjectMetadata, StorageError>(stubMeta)),
    deleteObject: mock(async () => Result.ok<void, StorageError>()),
    uploadObject: mock(async () => Result.ok<void, StorageError>()),
    listObjectKeys: mock(async () => Result.ok<string[], StorageError>([])),
    deleteObjects: mock(async () => Result.ok<void, StorageError>()),
    publicUrlFor: mock(() => "https://cdn.example.com/key"),
    ...overrides,
  } as unknown as IStorageService;
}

function makeService(storageOverrides: Partial<IStorageService> = {}): UploadService {
  return new UploadService(makeStorage(storageOverrides), noopOutbox, new NoOpInstrumentation());
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe("UploadService", () => {
  describe("createUploadUrl", () => {
    it("returns presigned URL with key and metadata (happy path)", async () => {
      const service = makeService();
      const result = await service.createUploadUrl({
        ownerId: OWNER_ID,
        filename: FILENAME,
        contentType: CONTENT_TYPE,
        size: SIZE,
        scope: SCOPE,
        expiresInSeconds: 300,
      });

      expect(result.isSuccess).toBe(true);
      const val = result.getValue();
      expect(val.url).toBe(stubPresignedUrl.url);
      expect(val.expiresAt).toBe(stubPresignedUrl.expiresAt);
      expect(val.key).toMatch(new RegExp(`^${OWNER_ID}/${SCOPE}/`));
      expect(val.key).toContain(FILENAME);
      expect(val.expectedSize).toBe(SIZE);
      expect(val.expectedContentType).toBe(CONTENT_TYPE);
    });

    it("propagates STORAGE_PROVIDER_FAILURE when presignUpload fails", async () => {
      const service = makeService({
        presignUpload: mock(async () =>
          Result.fail<PresignedUrl, StorageError>({
            code: "STORAGE_PROVIDER_FAILURE",
            message: "S3 unreachable",
          }),
        ),
      });

      const result = await service.createUploadUrl({
        ownerId: OWNER_ID,
        filename: FILENAME,
        contentType: CONTENT_TYPE,
        size: SIZE,
        scope: SCOPE,
        expiresInSeconds: 300,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("STORAGE_PROVIDER_FAILURE");
    });

    it("calls instrumentation span with op=function", async () => {
      const instrumentation = new NoOpInstrumentation();
      const spy = spyOn(instrumentation, "startSpan");
      const service = new UploadService(makeStorage(), noopOutbox, instrumentation);

      await service.createUploadUrl({
        ownerId: OWNER_ID,
        filename: FILENAME,
        contentType: CONTENT_TYPE,
        size: SIZE,
        scope: SCOPE,
        expiresInSeconds: 300,
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "UploadService > createUploadUrl", op: "function" }),
        expect.any(Function),
      );
    });
  });

  describe("confirmUpload", () => {
    it("returns confirmed metadata (happy path)", async () => {
      const validKey = `${OWNER_ID}/${SCOPE}/uuid-${FILENAME}`;
      const service = makeService();
      const result = await service.confirmUpload({
        ownerId: OWNER_ID,
        key: validKey,
        expectedSize: SIZE,
        expectedContentType: CONTENT_TYPE,
      });

      expect(result.isSuccess).toBe(true);
      const val = result.getValue();
      expect(val.key).toBe(validKey);
      expect(val.size).toBe(SIZE);
      expect(val.contentType).toBe(CONTENT_TYPE);
    });

    it("returns STORAGE_FORBIDDEN when key does not belong to owner", async () => {
      const service = makeService();
      const result = await service.confirmUpload({
        ownerId: OWNER_ID,
        key: "other-user/avatars/file.jpg",
        expectedSize: SIZE,
        expectedContentType: CONTENT_TYPE,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("STORAGE_FORBIDDEN");
    });

    it("returns STORAGE_INTEGRITY_FAILED and deletes object when size exceeds declared", async () => {
      const storage = makeStorage({
        headObject: mock(async () =>
          Result.ok<ObjectMetadata, StorageError>({ size: SIZE + 1, contentType: CONTENT_TYPE }),
        ),
      });
      const service = new UploadService(storage, noopOutbox, new NoOpInstrumentation());
      const validKey = `${OWNER_ID}/${SCOPE}/uuid-${FILENAME}`;

      const result = await service.confirmUpload({
        ownerId: OWNER_ID,
        key: validKey,
        expectedSize: SIZE,
        expectedContentType: CONTENT_TYPE,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("STORAGE_INTEGRITY_FAILED");
      expect(storage.deleteObject).toHaveBeenCalledWith(validKey);
    });

    it("returns STORAGE_INTEGRITY_FAILED and deletes object when content-type mismatches", async () => {
      const storage = makeStorage({
        headObject: mock(async () =>
          Result.ok<ObjectMetadata, StorageError>({ size: SIZE, contentType: "application/pdf" }),
        ),
      });
      const service = new UploadService(storage, noopOutbox, new NoOpInstrumentation());
      const validKey = `${OWNER_ID}/${SCOPE}/uuid-${FILENAME}`;

      const result = await service.confirmUpload({
        ownerId: OWNER_ID,
        key: validKey,
        expectedSize: SIZE,
        expectedContentType: CONTENT_TYPE,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("STORAGE_INTEGRITY_FAILED");
    });

    it("propagates headObject failure", async () => {
      const validKey = `${OWNER_ID}/${SCOPE}/uuid-${FILENAME}`;
      const service = makeService({
        headObject: mock(async () =>
          Result.fail<ObjectMetadata, StorageError>({
            code: "STORAGE_NOT_FOUND",
            message: "object not found",
          }),
        ),
      });

      const result = await service.confirmUpload({
        ownerId: OWNER_ID,
        key: validKey,
        expectedSize: SIZE,
        expectedContentType: CONTENT_TYPE,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("STORAGE_NOT_FOUND");
    });

    it("calls instrumentation span with op=function", async () => {
      const instrumentation = new NoOpInstrumentation();
      const spy = spyOn(instrumentation, "startSpan");
      const service = new UploadService(makeStorage(), noopOutbox, instrumentation);
      const validKey = `${OWNER_ID}/${SCOPE}/uuid-${FILENAME}`;

      await service.confirmUpload({
        ownerId: OWNER_ID,
        key: validKey,
        expectedSize: SIZE,
        expectedContentType: CONTENT_TYPE,
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "UploadService > confirmUpload", op: "function" }),
        expect.any(Function),
      );
    });
  });

  describe("deleteUpload", () => {
    it("deletes the object (happy path)", async () => {
      const storage = makeStorage();
      const service = new UploadService(storage, noopOutbox, new NoOpInstrumentation());
      const validKey = `${OWNER_ID}/${SCOPE}/uuid-${FILENAME}`;

      const result = await service.deleteUpload({ ownerId: OWNER_ID, key: validKey });

      expect(result.isSuccess).toBe(true);
      expect(storage.deleteObject).toHaveBeenCalledWith(validKey);
    });

    it("returns STORAGE_FORBIDDEN when key does not belong to owner", async () => {
      const service = makeService();
      const result = await service.deleteUpload({
        ownerId: OWNER_ID,
        key: "other-user/scope/file.jpg",
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("STORAGE_FORBIDDEN");
    });

    it("propagates deleteObject failure", async () => {
      const validKey = `${OWNER_ID}/${SCOPE}/uuid-${FILENAME}`;
      const service = makeService({
        deleteObject: mock(async () =>
          Result.fail<void, StorageError>({
            code: "STORAGE_PROVIDER_FAILURE",
            message: "S3 error",
          }),
        ),
      });

      const result = await service.deleteUpload({ ownerId: OWNER_ID, key: validKey });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("STORAGE_PROVIDER_FAILURE");
    });

    it("calls instrumentation span with op=function", async () => {
      const instrumentation = new NoOpInstrumentation();
      const spy = spyOn(instrumentation, "startSpan");
      const service = new UploadService(makeStorage(), noopOutbox, instrumentation);
      const validKey = `${OWNER_ID}/${SCOPE}/uuid-${FILENAME}`;

      await service.deleteUpload({ ownerId: OWNER_ID, key: validKey });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "UploadService > deleteUpload", op: "function" }),
        expect.any(Function),
      );
    });
  });

  describe("createDownloadUrl", () => {
    it("returns presigned download URL (happy path)", async () => {
      const validKey = `${OWNER_ID}/${SCOPE}/uuid-${FILENAME}`;
      const service = makeService();
      const result = await service.createDownloadUrl({
        ownerId: OWNER_ID,
        key: validKey,
        expiresInSeconds: 300,
      });

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().url).toBe(stubPresignedUrl.url);
      expect(result.getValue().expiresAt).toBe(stubPresignedUrl.expiresAt);
    });

    it("returns STORAGE_FORBIDDEN when key does not belong to owner", async () => {
      const service = makeService();
      const result = await service.createDownloadUrl({
        ownerId: OWNER_ID,
        key: "other-user/scope/file.jpg",
        expiresInSeconds: 300,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("STORAGE_FORBIDDEN");
    });

    it("propagates presignDownload failure", async () => {
      const validKey = `${OWNER_ID}/${SCOPE}/uuid-${FILENAME}`;
      const service = makeService({
        presignDownload: mock(async () =>
          Result.fail<PresignedUrl, StorageError>({
            code: "STORAGE_PROVIDER_FAILURE",
            message: "S3 error",
          }),
        ),
      });

      const result = await service.createDownloadUrl({
        ownerId: OWNER_ID,
        key: validKey,
        expiresInSeconds: 300,
      });

      expect(result.isFailure).toBe(true);
      expect(result.getError().code).toBe("STORAGE_PROVIDER_FAILURE");
    });

    it("calls instrumentation span with op=function", async () => {
      const instrumentation = new NoOpInstrumentation();
      const spy = spyOn(instrumentation, "startSpan");
      const service = new UploadService(makeStorage(), noopOutbox, instrumentation);
      const validKey = `${OWNER_ID}/${SCOPE}/uuid-${FILENAME}`;

      await service.createDownloadUrl({ ownerId: OWNER_ID, key: validKey, expiresInSeconds: 300 });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "UploadService > createDownloadUrl", op: "function" }),
        expect.any(Function),
      );
    });
  });
});
