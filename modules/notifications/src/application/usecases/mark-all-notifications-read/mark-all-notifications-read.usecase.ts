import { type IUnitOfWork, type IUseCase, Result } from "@packages/ddd-kit";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { notificationReadEvent } from "../../events/notification-read.event";
import type {
  INotificationStore,
  NotificationError,
} from "../../ports/repositories/notification.port";
import type { MarkAllNotificationsReadInput } from "./mark-all-notifications-read.dto";

export class MarkAllNotificationsReadUseCase
  implements IUseCase<MarkAllNotificationsReadInput, void, NotificationError>
{
  constructor(
    private readonly store: INotificationStore,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
  ) {}

  execute(input: MarkAllNotificationsReadInput): Promise<Result<void, NotificationError>> {
    return this.uow.run(async (): Promise<Result<void, NotificationError>> => {
      const result = await this.store.markAllRead(input.userId, new Date());
      if (result.isFailure) return Result.fail(result.getError());

      const marked = result.getValue();
      if (marked.length === 0) return Result.ok();

      await emitBuiltEvent(
        this.outbox,
        notificationReadEvent({
          userId: input.userId,
          scope: "all",
          count: marked.length,
          notificationIds: [],
        }),
      );

      return Result.ok();
    });
  }
}
