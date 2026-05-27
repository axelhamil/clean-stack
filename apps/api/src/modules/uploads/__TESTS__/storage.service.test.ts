import { beforeEach, describe, expect, it, mock } from "bun:test";

let nextSendOutcome: () => Promise<unknown> = () => Promise.resolve({});
let listPages: Array<{
  Contents?: Array<{ Key?: string }>;
  IsTruncated?: boolean;
  NextContinuationToken?: string;
}> = [];
let lastSendCount = 0;

class FakeNotFound extends Error {
  override name = "NotFound";
}

function commandFactory(name: string) {
  return class {
    name = name;
    constructor(public input: Record<string, unknown>) {}
  };
}

mock.module("@aws-sdk/client-s3", () => ({
  S3Client: class {
    async send(command: { name: string }) {
      lastSendCount++;
      if (command.name === "ListObjectsV2") {
        return listPages.shift() ?? { Contents: [], IsTruncated: false };
      }
      return nextSendOutcome();
    }
  },
  PutObjectCommand: commandFactory("PutObject"),
  GetObjectCommand: commandFactory("GetObject"),
  HeadObjectCommand: commandFactory("HeadObject"),
  HeadBucketCommand: commandFactory("HeadBucket"),
  DeleteObjectCommand: commandFactory("DeleteObject"),
  DeleteObjectsCommand: commandFactory("DeleteObjects"),
  ListObjectsV2Command: commandFactory("ListObjectsV2"),
  NotFound: FakeNotFound,
}));

mock.module("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: async () => "https://signed.example/url",
}));

const { S3StorageService } = await import("../infrastructure/services/storage.service");
const { NoOpInstrumentation } = await import("../../../shared/services/noop-instrumentation");

describe("S3StorageService (custom logic only)", () => {
  let service: InstanceType<typeof S3StorageService>;

  beforeEach(() => {
    nextSendOutcome = () => Promise.resolve({});
    listPages = [];
    lastSendCount = 0;
    service = new S3StorageService(new NoOpInstrumentation());
  });

  it("should map NotFound to STORAGE_NOT_FOUND but other errors to STORAGE_PROVIDER_FAILURE (error discriminator)", async () => {
    nextSendOutcome = () => Promise.reject(new FakeNotFound());
    const notFound = await service.headObject("missing");
    expect(notFound.isFailure).toBe(true);
    expect(notFound.getError().code).toBe("STORAGE_NOT_FOUND");

    nextSendOutcome = () => Promise.reject(new Error("network"));
    const provider = await service.headObject("k");
    expect(provider.isFailure).toBe(true);
    expect(provider.getError().code).toBe("STORAGE_PROVIDER_FAILURE");
  });

  it("should aggregate ListObjectsV2 results across continuation tokens (pagination loop)", async () => {
    listPages = [
      { Contents: [{ Key: "a" }, { Key: "b" }], IsTruncated: true, NextContinuationToken: "t1" },
      { Contents: [{ Key: "c" }], IsTruncated: false },
    ];
    const result = await service.listObjectKeys("user-1/");
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual(["a", "b", "c"]);
  });

  it("should short-circuit deleteObjects on empty list (no SDK call) and batch >1000 keys at a time", async () => {
    const empty = await service.deleteObjects([]);
    expect(empty.isSuccess).toBe(true);
    expect(lastSendCount).toBe(0);

    lastSendCount = 0;
    const keys = Array.from({ length: 2500 }, (_, i) => `k-${i}`);
    const batched = await service.deleteObjects(keys);
    expect(batched.isSuccess).toBe(true);
    expect(lastSendCount).toBe(3);
  });

  // -------------------------------------------------------------------------
  // presignUpload
  // -------------------------------------------------------------------------
  it("presignUpload happy path → returns signed URL + expiresAt", async () => {
    const result = await service.presignUpload({
      key: "user-1/uploads/uuid-filename.png",
      contentType: "image/png",
      size: 1024,
      expiresInSeconds: 300,
    });
    expect(result.isSuccess).toBe(true);
    const val = result.getValue();
    expect(val.url).toBe("https://signed.example/url");
    expect(typeof val.expiresAt).toBe("string");
    // expiresAt should be a future ISO date
    expect(new Date(val.expiresAt).getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it("presignUpload failure → STORAGE_PROVIDER_FAILURE", async () => {
    nextSendOutcome = () => Promise.reject(new Error("signer error"));
    // getSignedUrl will throw; we override the mock inline
    mock.module("@aws-sdk/s3-request-presigner", () => ({
      getSignedUrl: async () => {
        throw new Error("signer error");
      },
    }));
    // Re-instantiate service so it picks up new mock
    const svc = new S3StorageService(new NoOpInstrumentation());
    const result = await svc.presignUpload({
      key: "user-1/file.png",
      contentType: "image/png",
      size: 512,
      expiresInSeconds: 300,
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("STORAGE_PROVIDER_FAILURE");
    // Restore
    mock.module("@aws-sdk/s3-request-presigner", () => ({
      getSignedUrl: async () => "https://signed.example/url",
    }));
  });

  // -------------------------------------------------------------------------
  // presignDownload
  // -------------------------------------------------------------------------
  it("presignDownload happy path → returns signed URL", async () => {
    const result = await service.presignDownload({
      key: "user-1/uploads/uuid-filename.png",
      expiresInSeconds: 60,
    });
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().url).toBe("https://signed.example/url");
  });

  it("presignDownload failure → STORAGE_PROVIDER_FAILURE", async () => {
    mock.module("@aws-sdk/s3-request-presigner", () => ({
      getSignedUrl: async () => {
        throw new Error("presign download error");
      },
    }));
    const svc = new S3StorageService(new NoOpInstrumentation());
    const result = await svc.presignDownload({
      key: "user-1/file.png",
      expiresInSeconds: 60,
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("STORAGE_PROVIDER_FAILURE");
    mock.module("@aws-sdk/s3-request-presigner", () => ({
      getSignedUrl: async () => "https://signed.example/url",
    }));
  });

  // -------------------------------------------------------------------------
  // uploadObject
  // -------------------------------------------------------------------------
  it("uploadObject happy path → ok", async () => {
    nextSendOutcome = () => Promise.resolve({});
    const result = await service.uploadObject({
      key: "user-1/avatar.png",
      body: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
    });
    expect(result.isSuccess).toBe(true);
    expect(lastSendCount).toBe(1);
  });

  it("uploadObject failure → STORAGE_PROVIDER_FAILURE", async () => {
    nextSendOutcome = () => Promise.reject(new Error("put failed"));
    const result = await service.uploadObject({
      key: "user-1/avatar.png",
      body: new Uint8Array([1]),
      contentType: "image/png",
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("STORAGE_PROVIDER_FAILURE");
  });

  // -------------------------------------------------------------------------
  // deleteObject
  // -------------------------------------------------------------------------
  it("deleteObject happy path → ok", async () => {
    nextSendOutcome = () => Promise.resolve({});
    const result = await service.deleteObject("user-1/file.png");
    expect(result.isSuccess).toBe(true);
    expect(lastSendCount).toBe(1);
  });

  it("deleteObject failure → STORAGE_PROVIDER_FAILURE", async () => {
    nextSendOutcome = () => Promise.reject(new Error("delete failed"));
    const result = await service.deleteObject("user-1/file.png");
    expect(result.isFailure).toBe(true);
    expect(result.getError().code).toBe("STORAGE_PROVIDER_FAILURE");
  });

  // -------------------------------------------------------------------------
  // publicUrlFor
  // -------------------------------------------------------------------------
  it("publicUrlFor returns concatenated public URL + key", () => {
    // publicUrl is built from env.S3_PUBLIC_URL which is undefined in test → empty string
    // So publicUrlFor("key") = "/key"
    const url = service.publicUrlFor("user-1/avatar.png");
    expect(url).toContain("user-1/avatar.png");
  });
});
