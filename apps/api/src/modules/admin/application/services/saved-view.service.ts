import {
  STAFF_REFUSAL,
  STAFF_VIEW_SCREEN_PERMISSION,
  type StaffPermission,
  type StaffView,
  screensOpenTo,
} from "@packages/access-control";
import { type AppError, type IUnitOfWork, Result, uuidv7 } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "../../../../shared/event-emitter";
import type { IOutboxRepository } from "../../../../shared/ports/outbox.port";
import type {
  ISavedViewStore,
  SavedViewRow,
  SavedViewStoreError,
} from "../ports/saved-view-store.port";

export const SAVED_VIEWS_LIMIT = 200;

export type SaveViewError = SavedViewStoreError | AppError<typeof STAFF_REFUSAL.permissionMissing>;

export type DeleteViewError = SavedViewStoreError | AppError<"ADMIN_VIEW_NOT_FOUND">;

export class SavedViewService {
  constructor(
    private readonly store: ISavedViewStore,
    private readonly outbox: IOutboxRepository,
    private readonly uow: IUnitOfWork,
  ) {}

  list(input: {
    ownerId: string;
    permissions: readonly StaffPermission[];
  }): Promise<Result<SavedViewRow[], SavedViewStoreError>> {
    return this.store.list(input.ownerId, screensOpenTo(input.permissions), SAVED_VIEWS_LIMIT);
  }

  async save(input: {
    actorUserId: string;
    permissions: readonly StaffPermission[];
    view: StaffView;
  }): Promise<Result<{ id: string }, SaveViewError>> {
    const { actorUserId, permissions, view } = input;
    const required = STAFF_VIEW_SCREEN_PERMISSION[view.screen];

    if (!permissions.includes(required)) {
      return Result.fail({
        code: STAFF_REFUSAL.permissionMissing,
        message: `This action requires the ${required} permission.`,
      });
    }

    return this.uow.run(async (): Promise<Result<{ id: string }, SaveViewError>> => {
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

  async remove(input: {
    actorUserId: string;
    viewId: string;
  }): Promise<Result<void, DeleteViewError>> {
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
