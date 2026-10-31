import type { StaffView, StaffViewScreen } from "@packages/access-control";
import type { AppError, Option, Result } from "@packages/ddd-kit";

export type SavedViewStoreError = AppError<"ADMIN_VIEW_PROVIDER_FAILURE">;

export type SavedViewRow = StaffView & { id: string; updatedAt: Date };

export interface DeletedSavedView {
  id: string;
  screen: string;
}

export interface ISavedViewStore {
  list(
    ownerId: string,
    screens: StaffViewScreen[],
    limit: number,
  ): Promise<Result<SavedViewRow[], SavedViewStoreError>>;
  save(ownerId: string, id: string, view: StaffView): Promise<Result<string, SavedViewStoreError>>;
  remove(
    ownerId: string,
    id: string,
  ): Promise<Result<Option<DeletedSavedView>, SavedViewStoreError>>;
}
