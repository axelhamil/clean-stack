import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Result } from "@packages/ddd-kit";
import { env } from "../../../../shared/env";
import { logger } from "../../../../shared/logger";
import type {
  IStorageService,
  ObjectMetadata,
  PresignDownloadInput,
  PresignedUrl,
  PresignUploadInput,
  StorageError,
  UploadObjectInput,
} from "../../../../shared/ports/storage.port";

const S3_DELETE_BATCH = 1000;

export class S3StorageService implements IStorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor() {
    this.bucket = env.S3_BUCKET;
    this.publicUrl = env.S3_PUBLIC_URL.replace(/\/+$/, "");

    if (env.NODE_ENV === "production") {
      const isLocalhost = env.S3_ENDPOINT.includes("localhost");
      const isDefaultCreds =
        env.S3_ACCESS_KEY === "minioadmin" || env.S3_SECRET_KEY === "minioadmin";
      if (isLocalhost || isDefaultCreds) {
        throw new Error(
          "Storage misconfigured in production: S3_ENDPOINT must point to R2 (or another real S3) and credentials must not be default minioadmin",
        );
      }
    }

    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  }

  async presignUpload(input: PresignUploadInput): Promise<Result<PresignedUrl, StorageError>> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        ContentType: input.contentType,
        ContentLength: input.size,
      });
      const url = await getSignedUrl(this.client, command, {
        expiresIn: input.expiresInSeconds,
        signableHeaders: new Set(["content-type", "content-length"]),
      });
      return Result.ok({
        url,
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
      });
    } catch (e) {
      return this.fail(e, "presign upload failed", { key: input.key });
    }
  }

  async presignDownload(input: PresignDownloadInput): Promise<Result<PresignedUrl, StorageError>> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
      });
      const url = await getSignedUrl(this.client, command, {
        expiresIn: input.expiresInSeconds,
      });
      return Result.ok({
        url,
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
      });
    } catch (e) {
      return this.fail(e, "presign download failed", { key: input.key });
    }
  }

  async headObject(key: string): Promise<Result<ObjectMetadata, StorageError>> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return Result.ok({
        size: res.ContentLength ?? 0,
        contentType: res.ContentType ?? "application/octet-stream",
      });
    } catch (e) {
      if (e instanceof NotFound) {
        return Result.fail({
          code: "STORAGE_NOT_FOUND",
          message: `object "${key}" not found`,
        });
      }
      return this.fail(e, "head object failed", { key });
    }
  }

  async deleteObject(key: string): Promise<Result<void, StorageError>> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      return Result.ok();
    } catch (e) {
      return this.fail(e, "delete object failed", { key });
    }
  }

  async uploadObject(input: UploadObjectInput): Promise<Result<void, StorageError>> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
        }),
      );
      return Result.ok();
    } catch (e) {
      return this.fail(e, "upload object failed", { key: input.key });
    }
  }

  async listObjectKeys(prefix: string): Promise<Result<string[], StorageError>> {
    try {
      const keys: string[] = [];
      let continuationToken: string | undefined;
      do {
        const res = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );
        for (const obj of res.Contents ?? []) {
          if (obj.Key) keys.push(obj.Key);
        }
        continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
      } while (continuationToken);
      return Result.ok(keys);
    } catch (e) {
      return this.fail(e, "list object keys failed", { prefix });
    }
  }

  async deleteObjects(keys: string[]): Promise<Result<void, StorageError>> {
    if (keys.length === 0) return Result.ok();
    try {
      for (let i = 0; i < keys.length; i += S3_DELETE_BATCH) {
        const batch = keys.slice(i, i + S3_DELETE_BATCH);
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        );
      }
      return Result.ok();
    } catch (e) {
      return this.fail(e, "delete objects failed", { count: keys.length });
    }
  }

  publicUrlFor(key: string): string {
    return `${this.publicUrl}/${key}`;
  }

  private fail(e: unknown, msg: string, ctx: Record<string, unknown>): Result<never, StorageError> {
    const message = e instanceof Error ? e.message : "unknown error";
    logger.error({ err: e, ...ctx }, msg);
    return Result.fail({ code: "STORAGE_PROVIDER_FAILURE", message });
  }
}
