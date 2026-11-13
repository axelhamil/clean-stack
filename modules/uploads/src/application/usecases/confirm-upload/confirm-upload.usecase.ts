import { type IUseCase, Result } from "@packages/ddd-kit";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { uploadConfirmedEvent } from "../../events/upload-confirmed.event";
import type { IStorageService, StorageError } from "../../ports/services/storage.port";
import { isOwnedBy, NOT_OWNED } from "../../services/upload-policy.service";
import type { ConfirmUploadInput, ConfirmUploadOutput } from "./confirm-upload.dto";

export class ConfirmUploadUseCase
  implements IUseCase<ConfirmUploadInput, ConfirmUploadOutput, StorageError>
{
  constructor(
    private readonly storage: IStorageService,
    private readonly outbox: IOutboxRepository,
  ) {}

  async execute(input: ConfirmUploadInput): Promise<Result<ConfirmUploadOutput, StorageError>> {
    if (!isOwnedBy(input.key, input.ownerId)) return Result.fail(NOT_OWNED);

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

    await emitBuiltEvent(
      this.outbox,
      await uploadConfirmedEvent({ ownerId: input.ownerId, key: input.key, size, contentType }),
    );

    return Result.ok({
      key: input.key,
      size,
      contentType,
      publicUrl: this.storage.publicUrlFor(input.key),
    });
  }
}
