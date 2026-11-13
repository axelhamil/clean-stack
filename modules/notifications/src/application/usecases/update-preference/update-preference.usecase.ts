import { type IUnitOfWork, type IUseCase, Result } from "@packages/ddd-kit";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { notificationPreferenceUpdatedEvent } from "../../events/notification-preference-updated.event";
import type {
  INotificationStore,
  NotificationError,
} from "../../ports/repositories/notification.port";
import type { UpdatePreferenceInput } from "./update-preference.dto";

export class UpdatePreferenceUseCase
  implements IUseCase<UpdatePreferenceInput, void, NotificationError>
{
  constructor(
    private readonly store: INotificationStore,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
  ) {}

  execute(input: UpdatePreferenceInput): Promise<Result<void, NotificationError>> {
    const { userId, category, channel, enabled, frequency } = input;

    return this.uow.run(async (): Promise<Result<void, NotificationError>> => {
      const saved = await this.store.upsertPreference({
        scope: "user",
        scopeId: userId,
        category,
        channel,
        enabled,
        frequency,
        locked: false,
      });
      if (saved.isFailure) return Result.fail(saved.getError());

      await emitBuiltEvent(
        this.outbox,
        notificationPreferenceUpdatedEvent({ userId, category, channel, enabled, frequency }),
      );

      return Result.ok();
    });
  }
}
