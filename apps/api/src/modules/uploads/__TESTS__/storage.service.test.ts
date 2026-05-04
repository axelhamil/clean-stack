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
  DeleteObjectCommand: commandFactory("DeleteObject"),
  DeleteObjectsCommand: commandFactory("DeleteObjects"),
  ListObjectsV2Command: commandFactory("ListObjectsV2"),
  NotFound: FakeNotFound,
}));

mock.module("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: async () => "https://signed.example/url",
}));

const { S3StorageService } = await import("../infrastructure/services/storage.service");

describe("S3StorageService (custom logic only)", () => {
  let service: InstanceType<typeof S3StorageService>;

  beforeEach(() => {
    nextSendOutcome = () => Promise.resolve({});
    listPages = [];
    lastSendCount = 0;
    service = new S3StorageService();
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
});
