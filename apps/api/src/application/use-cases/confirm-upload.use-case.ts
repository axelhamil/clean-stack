import { Result } from "@packages/ddd-kit";
import type { IStorageService, StorageError } from "../ports/storage.port";

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

export class ConfirmUploadUseCase {
  constructor(private readonly storage: IStorageService) {}

  async execute(input: ConfirmUploadInput): Promise<Result<ConfirmUploadOutput, StorageError>> {
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
}
