import { Result } from "@packages/ddd-kit";
import { env } from "../../../common/env";
import type { IStorageService, StorageError } from "../ports/storage.port";

export interface CreateDownloadUrlInput {
  ownerId: string;
  key: string;
  expiresInSeconds: number;
}

export interface CreateDownloadUrlOutput {
  url: string;
  expiresAt: string;
}

export class CreateDownloadUrlUseCase {
  constructor(private readonly storage: IStorageService) {}

  async execute(
    input: CreateDownloadUrlInput,
  ): Promise<Result<CreateDownloadUrlOutput, StorageError>> {
    if (!input.key.startsWith(`${input.ownerId}/`)) {
      return Result.fail({
        code: "STORAGE_FORBIDDEN",
        message: "key does not belong to the requesting owner",
      });
    }

    const ttl = Math.min(
      Math.max(input.expiresInSeconds, env.STORAGE_PRESIGN_TTL_MIN_SECONDS),
      env.STORAGE_PRESIGN_TTL_MAX_SECONDS,
    );

    const presigned = await this.storage.presignDownload({
      key: input.key,
      expiresInSeconds: ttl,
    });
    if (presigned.isFailure) return Result.fail(presigned.getError());

    return Result.ok(presigned.getValue());
  }
}
