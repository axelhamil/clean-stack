import { type IUnitOfWork, type IUseCase, Result } from "@packages/ddd-kit";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { notificationOrgPreferenceUpdatedEvent } from "../../events/notification-org-preference-updated.event";
import type {
  INotificationStore,
  NotificationError,
} from "../../ports/repositories/notification.port";
import type { UpdateOrgPreferenceInput } from "./update-org-preference.dto";

export class UpdateOrgPreferenceUseCase
  implements IUseCase<UpdateOrgPreferenceInput, void, NotificationError>
{
  constructor(
    private readonly store: INotificationStore,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
  ) {}

  execute(input: UpdateOrgPreferenceInput): Promise<Result<void, NotificationError>> {
    const { organizationId, actorUserId, category, channel, enabled, frequency, locked } = input;

    return this.uow.run(async (): Promise<Result<void, NotificationError>> => {
      const saved = await this.store.upsertPreference({
        scope: "org",
        scopeId: organizationId,
        category,
        channel,
        enabled,
        frequency,
        locked,
      });
      if (saved.isFailure) return Result.fail(saved.getError());

      await emitBuiltEvent(
        this.outbox,
        notificationOrgPreferenceUpdatedEvent({
          organizationId,
          actorUserId,
          category,
          channel,
          enabled,
          frequency,
          locked,
        }),
        { organizationId },
      );

      return Result.ok();
    });
  }
}
