import { type IUseCase, Result } from "@packages/ddd-kit";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type { UploadSettings } from "../../config/upload-settings";
import { uploadRequestedEvent } from "../../events/upload-requested.event";
import type { IStorageService, StorageError } from "../../ports/services/storage.port";
import { clampTtl } from "../../services/upload-policy.service";
import type { CreateUploadUrlInput, CreateUploadUrlOutput } from "./create-upload-url.dto";

export class CreateUploadUrlUseCase
  implements IUseCase<CreateUploadUrlInput, CreateUploadUrlOutput, StorageError>
{
  constructor(
    private readonly storage: IStorageService,
    private readonly outbox: IOutboxRepository,
    private readonly settings: UploadSettings,
  ) {}

  async execute(input: CreateUploadUrlInput): Promise<Result<CreateUploadUrlOutput, StorageError>> {
    const key = `${input.ownerId}/${input.scope}/${crypto.randomUUID()}-${input.filename}`;

    const presigned = await this.storage.presignUpload({
      key,
      contentType: input.contentType,
      size: input.size,
      expiresInSeconds: clampTtl(input.expiresInSeconds, this.settings),
    });
    if (presigned.isFailure) return Result.fail(presigned.getError());

    await emitBuiltEvent(
      this.outbox,
      await uploadRequestedEvent({
        ownerId: input.ownerId,
        key,
        contentType: input.contentType,
        size: input.size,
      }),
    );

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
