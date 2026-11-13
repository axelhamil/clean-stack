import { type IUseCase, Option, Result } from "@packages/ddd-kit";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { uploadDeletedEvent } from "../../events/upload-deleted.event";
import type { IStorageService, StorageError } from "../../ports/services/storage.port";
import { isOwnedBy, NOT_OWNED } from "../../services/upload-policy.service";
import type { DeleteUploadInput, DeleteUploadOutput } from "./delete-upload.dto";

export class DeleteUploadUseCase
  implements IUseCase<DeleteUploadInput, DeleteUploadOutput, StorageError>
{
  constructor(
    private readonly storage: IStorageService,
    private readonly outbox: IOutboxRepository,
  ) {}

  async execute(input: DeleteUploadInput): Promise<Result<DeleteUploadOutput, StorageError>> {
    const resolved =
      "key" in input ? Option.some(input.key) : this.storage.keyFromPublicUrl(input.url);
    if (resolved.isNone()) return Result.ok({ deleted: false });

    const key = resolved.unwrap();
    if (!isOwnedBy(key, input.ownerId)) return Result.fail(NOT_OWNED);

    const deleted = await this.storage.deleteObject(key);
    if (deleted.isFailure) return Result.fail(deleted.getError());

    await emitBuiltEvent(this.outbox, await uploadDeletedEvent({ ownerId: input.ownerId, key }));

    return Result.ok({ deleted: true });
  }
}
