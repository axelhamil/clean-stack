import { STAFF_REFUSAL, STAFF_VIEW_SCREEN_PERMISSION } from "@packages/access-control";
import { type AppError, type IUnitOfWork, type IUseCase, Result, uuidv7 } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type {
  ISavedViewStore,
  SavedViewStoreError,
} from "../../ports/repositories/saved-view-store.port";
import type { SaveViewInput, SaveViewOutput } from "./save-view.dto";

export type SaveViewError = SavedViewStoreError | AppError<typeof STAFF_REFUSAL.permissionMissing>;

export class SaveViewUseCase implements IUseCase<SaveViewInput, SaveViewOutput, SaveViewError> {
  constructor(
    private readonly store: ISavedViewStore,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
  ) {}

  async execute(input: SaveViewInput): Promise<Result<SaveViewOutput, SaveViewError>> {
    const { actorUserId, permissions, view } = input;
    const required = STAFF_VIEW_SCREEN_PERMISSION[view.screen];

    if (!permissions.includes(required)) {
      return Result.fail({
        code: STAFF_REFUSAL.permissionMissing,
        message: `This action requires the ${required} permission.`,
      });
    }

    return this.uow.run(async (): Promise<Result<SaveViewOutput, SaveViewError>> => {
      const saved = await this.store.save(actorUserId, uuidv7(), view);
      if (saved.isFailure) return Result.fail(saved.getError());

      const id = saved.getValue();
      await emitEvent(this.outbox, EventTypes.ADMIN_VIEW_SAVED, "saved_view", id, {
        actorUserId,
        viewId: id,
        screen: view.screen,
      });

      return Result.ok({ id });
    });
  }
}
