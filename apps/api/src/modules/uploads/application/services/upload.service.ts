import { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { CryptoHasher } from "bun";
import { env } from "../../../../shared/env";
import { emitEvent } from "../../../../shared/event-emitter";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";
import type { IStorageService, StorageError } from "../../../../shared/ports/storage.port";

function hashKey(key: string): string {
  return new CryptoHasher("sha256").update(key).digest("hex").slice(0, 16);
}

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

export interface DeleteUploadInput {
  ownerId: string;
  key: string;
}

export class UploadService {
  constructor(
    private readonly storage: IStorageService,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async createUploadUrl(
    input: CreateUploadUrlInput,
  ): Promise<Result<CreateUploadUrlOutput, StorageError>> {
    return this.instrumentation.startSpan(
      { name: "UploadService > createUploadUrl", op: "function" },
      async () => {
        const ttl = clampTtl(input.expiresInSeconds);
        const key = `${input.ownerId}/${input.scope}/${crypto.randomUUID()}-${input.filename}`;

        const presigned = await this.storage.presignUpload({
          key,
          contentType: input.contentType,
          size: input.size,
          expiresInSeconds: ttl,
        });
        if (presigned.isFailure) return Result.fail(presigned.getError());

        await emitEvent(this.outbox, EventTypes.UPLOAD_REQUESTED, "upload", hashKey(key), {
          userId: input.ownerId,
          key: hashKey(key),
          contentType: input.contentType,
          size: input.size,
        });

        const { url, expiresAt } = presigned.getValue();
        return Result.ok({
          url,
          key,
          publicUrl: this.storage.publicUrlFor(key),
          expiresAt,
          expectedSize: input.size,
          expectedContentType: input.contentType,
        });
      },
    );
  }

  async confirmUpload(
    input: ConfirmUploadInput,
  ): Promise<Result<ConfirmUploadOutput, StorageError>> {
    return this.instrumentation.startSpan(
      { name: "UploadService > confirmUpload", op: "function" },
      async () => {
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

        await emitEvent(this.outbox, EventTypes.UPLOAD_CONFIRMED, "upload", hashKey(input.key), {
          userId: input.ownerId,
          key: hashKey(input.key),
          size,
          contentType,
        });

        return Result.ok({
          key: input.key,
          size,
          contentType,
          publicUrl: this.storage.publicUrlFor(input.key),
        });
      },
    );
  }

  async deleteUpload(input: DeleteUploadInput): Promise<Result<void, StorageError>> {
    return this.instrumentation.startSpan(
      { name: "UploadService > deleteUpload", op: "function" },
      async () => {
        if (!input.key.startsWith(`${input.ownerId}/`)) {
          return Result.fail({
            code: "STORAGE_FORBIDDEN",
            message: "key does not belong to the requesting owner",
          });
        }

        const deleted = await this.storage.deleteObject(input.key);
        if (deleted.isFailure) return Result.fail(deleted.getError());

        await emitEvent(this.outbox, EventTypes.UPLOAD_DELETED, "upload", hashKey(input.key), {
          userId: input.ownerId,
          key: hashKey(input.key),
        });

        return Result.ok(undefined);
      },
    );
  }

  async createDownloadUrl(
    input: CreateDownloadUrlInput,
  ): Promise<Result<CreateDownloadUrlOutput, StorageError>> {
    return this.instrumentation.startSpan(
      { name: "UploadService > createDownloadUrl", op: "function" },
      async () => {
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
      },
    );
  }
}

function clampTtl(seconds: number): number {
  return Math.min(
    Math.max(seconds, env.STORAGE_PRESIGN_TTL_MIN_SECONDS ?? 60),
    env.STORAGE_PRESIGN_TTL_MAX_SECONDS ?? 3600,
  );
}
