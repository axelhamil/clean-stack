import { Result } from "@packages/ddd-kit";
import { env } from "../../../common/env";
import type { IStorageService, StorageError } from "../ports/storage.port";

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

export class CreateUploadUrlUseCase {
  constructor(private readonly storage: IStorageService) {}

  async execute(input: CreateUploadUrlInput): Promise<Result<CreateUploadUrlOutput, StorageError>> {
    const ttl = Math.min(
      Math.max(input.expiresInSeconds, env.STORAGE_PRESIGN_TTL_MIN_SECONDS),
      env.STORAGE_PRESIGN_TTL_MAX_SECONDS,
    );
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
}
