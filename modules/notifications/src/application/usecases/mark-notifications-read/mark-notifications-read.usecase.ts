import { type IUnitOfWork, type IUseCase, Result } from "@packages/ddd-kit";
import { emitBuiltEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { notificationReadEvent } from "../../events/notification-read.event";
import type { INotificationStore } from "../../ports/repositories/notification.port";
import type {
  MarkNotificationsReadError,
  MarkNotificationsReadInput,
} from "./mark-notifications-read.dto";

export class MarkNotificationsReadUseCase
  implements IUseCase<MarkNotificationsReadInput, void, MarkNotificationsReadError>
{
  constructor(
    private readonly store: INotificationStore,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
  ) {}

  execute(input: MarkNotificationsReadInput): Promise<Result<void, MarkNotificationsReadError>> {
    return this.uow.run(async (): Promise<Result<void, MarkNotificationsReadError>> => {
      const result = await this.store.markRead(input.userId, input.ids, new Date());
      if (result.isFailure) return Result.fail(result.getError());

      const marked = result.getValue();
      if (marked.length !== new Set(input.ids).size) {
        return Result.fail({
          code: "NOTIFICATION_NOT_FOUND",
          message: "One or more notifications were not found.",
        });
      }

      await emitBuiltEvent(
        this.outbox,
        notificationReadEvent({
          userId: input.userId,
          scope: "selection",
          count: marked.length,
          notificationIds: marked,
        }),
      );

      return Result.ok();
    });
  }
}
