import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Result } from "@packages/ddd-kit";
import { env } from "../../../common/env";
import { logger } from "../../../common/logger";
import type {
  IStorageService,
  ObjectMetadata,
  PresignDownloadInput,
  PresignedUrl,
  PresignUploadInput,
  StorageError,
} from "../../application/ports/storage.port";

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

  publicUrlFor(key: string): string {
    return `${this.publicUrl}/${key}`;
  }

  private fail(e: unknown, msg: string, ctx: Record<string, unknown>): Result<never, StorageError> {
    const message = e instanceof Error ? e.message : "unknown error";
    logger.error({ err: e, ...ctx }, msg);
    return Result.fail({ code: "STORAGE_PROVIDER_FAILURE", message });
  }
}
