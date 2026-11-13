import { type IUnitOfWork, type IUseCase, Result } from "@packages/ddd-kit";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { userLocaleChangedEvent } from "../../events/user-locale-changed.event";
import type { IProfileRepository, ProfileError } from "../../ports/repositories/profile.port";
import type { IGetLocaleQuery } from "../../queries/get-locale.query";
import type { SetLocaleInput } from "./set-locale.dto";

export class SetLocaleUseCase implements IUseCase<SetLocaleInput, void, ProfileError> {
  constructor(
    private readonly currentLocale: IGetLocaleQuery,
    private readonly repo: IProfileRepository,
    private readonly uow: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
  ) {}

  execute(input: SetLocaleInput): Promise<Result<void, ProfileError>> {
    return this.uow.run(async (): Promise<Result<void, ProfileError>> => {
      const previous = await this.currentLocale.execute({ userId: input.userId });
      if (previous.isFailure) return Result.fail(previous.getError());

      const written = await this.repo.setLocale(input.userId, input.locale);
      if (written.isFailure) return written;

      await emitBuiltEvent(
        this.outbox,
        userLocaleChangedEvent({ ...input, previousLocale: previous.getValue() }),
      );

      return Result.ok();
    });
  }
}
