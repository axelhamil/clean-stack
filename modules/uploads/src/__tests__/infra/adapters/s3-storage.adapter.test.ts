import { beforeEach, describe, expect, it, mock } from "bun:test";
import * as realS3 from "@aws-sdk/client-s3";
import * as realPresigner from "@aws-sdk/s3-request-presigner";
import type { ILogger } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";

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
  ...realS3,
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
  ...realPresigner,
  getSignedUrl: async () => "https://signed.example/url",
}));

const { S3StorageService } = await import("../../../infra/adapters/s3-storage.adapter");

const S3_SETTINGS = {
  endpoint: "http://localhost:8333",
  accessKey: "dev",
  secretKey: "dev",
  bucket: "clean-stack",
  publicUrl: "",
  region: "auto",
  forcePathStyle: true,
  production: false,
};

describe("S3StorageService (custom logic only)", () => {
  let service: InstanceType<typeof S3StorageService>;

  beforeEach(() => {
    nextSendOutcome = () => Promise.resolve({});
    listPages = [];
    lastSendCount = 0;
    service = new S3StorageService(S3_SETTINGS, mockInstrumentation(), mockPort<ILogger>());
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

  it("refuses a production storage on a local endpoint or the dev credentials", () => {
    const build = (settings: typeof S3_SETTINGS) => () =>
      new S3StorageService(settings, mockInstrumentation(), mockPort<ILogger>());
    const real = {
      ...S3_SETTINGS,
      production: true,
      endpoint: "https://account.r2.cloudflarestorage.com",
      accessKey: "real-key",
      secretKey: "real-secret",
    };

    expect(build({ ...real, endpoint: "http://localhost:8333" })).toThrow();
    expect(build({ ...real, secretKey: "dev" })).toThrow();
    expect(build(real)).not.toThrow();
  });

  it("keyFromPublicUrl is the inverse of publicUrlFor", () => {
    const key = "user-1/avatars/abc-photo.png";
    const roundTripped = service.keyFromPublicUrl(service.publicUrlFor(key));
    expect(roundTripped.unwrap()).toBe(key);
  });

  it("keyFromPublicUrl returns none for a URL from another origin", () => {
    expect(service.keyFromPublicUrl("https://lh3.googleusercontent.com/a/photo.jpg").isNone()).toBe(
      true,
    );
  });

  it("keyFromPublicUrl returns none for a URL that only looks like a prefix match", () => {
    expect(service.keyFromPublicUrl(`${service.publicUrlFor("")}../escaped`).isNone()).toBe(true);
  });
});
