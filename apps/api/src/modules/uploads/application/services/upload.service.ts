import { Result } from "@packages/ddd-kit";
import { env } from "../../../../shared/env";
import type { IStorageService, StorageError } from "../../../../shared/ports/storage.port";

export interface CreateUploadUrlInput {
  ownerId: string;
  filename: string;
  contentType: string;
  size: number;
  scope: string;
  expiresInSeconds: number;
}

export interface CreateUploadUrlOutput {
  url: string;
  key: string;
  publicUrl: string;
  expiresAt: string;
  expectedSize: number;
  expectedContentType: string;
}

export interface ConfirmUploadInput {
  ownerId: string;
  key: string;
  expectedSize: number;
  expectedContentType: string;
}

export interface ConfirmUploadOutput {
  key: string;
  size: number;
  contentType: string;
  publicUrl: string;
}

export interface CreateDownloadUrlInput {
  ownerId: string;
  key: string;
  expiresInSeconds: number;
}

export interface CreateDownloadUrlOutput {
  url: string;
  expiresAt: string;
}

export class UploadService {
  constructor(private readonly storage: IStorageService) {}

  async createUploadUrl(
    input: CreateUploadUrlInput,
  ): Promise<Result<CreateUploadUrlOutput, StorageError>> {
    const ttl = clampTtl(input.expiresInSeconds);
    const key = `${input.ownerId}/${input.scope}/${crypto.randomUUID()}-${input.filename}`;

    const presigned = await this.storage.presignUpload({
      key,
      contentType: input.contentType,
      size: input.size,
      expiresInSeconds: ttl,
    });
    if (presigned.isFailure) return Result.fail(presigned.getError());

    const { url, expiresAt } = presigned.getValue();
    return Result.ok({
      url,
      key,
      publicUrl: this.storage.publicUrlFor(key),
      expiresAt,
      expectedSize: input.size,
      expectedContentType: input.contentType,
    });
  }

  async confirmUpload(
    input: ConfirmUploadInput,
  ): Promise<Result<ConfirmUploadOutput, StorageError>> {
    if (!input.key.startsWith(`${input.ownerId}/`))
      return Result.fail({
        code: "STORAGE_FORBIDDEN",
        message: "key does not belong to the requesting owner",
      });

    const head = await this.storage.headObject(input.key);
    if (head.isFailure) return Result.fail(head.getError());

    const { size, contentType } = head.getValue();
    const sizeExceeded = size > input.expectedSize;
    const contentTypeMismatch = contentType !== input.expectedContentType;

    if (sizeExceeded || contentTypeMismatch) {
      const cleanup = await this.storage.deleteObject(input.key);
      if (cleanup.isFailure) return Result.fail(cleanup.getError());
      return Result.fail({
        code: "STORAGE_INTEGRITY_FAILED",
        message: sizeExceeded
          ? `uploaded size ${size} exceeds declared ${input.expectedSize}`
          : `uploaded content-type ${contentType} does not match declared ${input.expectedContentType}`,
      });
    }

    return Result.ok({
      key: input.key,
      size,
      contentType,
      publicUrl: this.storage.publicUrlFor(input.key),
    });
  }

  async createDownloadUrl(
    input: CreateDownloadUrlInput,
  ): Promise<Result<CreateDownloadUrlOutput, StorageError>> {
    if (!input.key.startsWith(`${input.ownerId}/`)) {
      return Result.fail({
        code: "STORAGE_FORBIDDEN",
        message: "key does not belong to the requesting owner",
      });
    }

    const presigned = await this.storage.presignDownload({
      key: input.key,
      expiresInSeconds: clampTtl(input.expiresInSeconds),
    });
    if (presigned.isFailure) return Result.fail(presigned.getError());

    return Result.ok(presigned.getValue());
  }
}

function clampTtl(seconds: number): number {
  return Math.min(
    Math.max(seconds, env.STORAGE_PRESIGN_TTL_MIN_SECONDS ?? 60),
    env.STORAGE_PRESIGN_TTL_MAX_SECONDS ?? 3600,
  );
}
