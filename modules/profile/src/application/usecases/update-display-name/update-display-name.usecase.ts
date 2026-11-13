import { type IUnitOfWork, type IUseCase, Result } from "@packages/ddd-kit";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { userProfileUpdatedEvent } from "../../events/user-profile-updated.event";
import type {
  IUserNameWriter,
  UserNameWriterError,
} from "../../ports/services/user-name-writer.port";
import type { UpdateDisplayNameInput } from "./update-display-name.dto";

export class UpdateDisplayNameUseCase
  implements IUseCase<UpdateDisplayNameInput, void, UserNameWriterError>
{
  constructor(
    private readonly names: IUserNameWriter,
    private readonly uow: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
  ) {}

  execute(input: UpdateDisplayNameInput): Promise<Result<void, UserNameWriterError>> {
    return this.uow.run(async (): Promise<Result<void, UserNameWriterError>> => {
      const written = await this.names.setName(input.userId, input.name);
      if (written.isFailure) return written;

      await emitBuiltEvent(this.outbox, userProfileUpdatedEvent(input));

      return Result.ok();
    });
  }
}
