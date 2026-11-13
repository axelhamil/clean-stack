import { type AppError, type IUnitOfWork, type IUseCase, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type {
  ISavedViewStore,
  SavedViewStoreError,
} from "../../ports/repositories/saved-view-store.port";
import type { DeleteViewInput } from "./delete-view.dto";

export type DeleteViewError = SavedViewStoreError | AppError<"ADMIN_VIEW_NOT_FOUND">;

export class DeleteViewUseCase implements IUseCase<DeleteViewInput, void, DeleteViewError> {
  constructor(
    private readonly store: ISavedViewStore,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
  ) {}

  execute(input: DeleteViewInput): Promise<Result<void, DeleteViewError>> {
    const { actorUserId, viewId } = input;

    return this.uow.run(async (): Promise<Result<void, DeleteViewError>> => {
      const removed = await this.store.remove(actorUserId, viewId);
      if (removed.isFailure) return Result.fail(removed.getError());

      const found = removed.getValue();
      if (found.isNone()) {
        return Result.fail({
          code: "ADMIN_VIEW_NOT_FOUND",
          message: "This saved view no longer exists.",
        });
      }

      const { id, screen } = found.unwrap();
      await emitEvent(this.outbox, EventTypes.ADMIN_VIEW_DELETED, "saved_view", id, {
        actorUserId,
        viewId: id,
        screen,
      });

      return Result.ok();
    });
  }
}
