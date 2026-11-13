import type { StaffPermission } from "@packages/access-control";
import type { IQuery } from "@packages/ddd-kit";
import type {
  SavedViewRow,
  SavedViewStoreError,
} from "../ports/repositories/saved-view-store.port";

export interface ListSavedViewsInput {
  ownerId: string;
  permissions: readonly StaffPermission[];
}

export type IListSavedViewsQuery = IQuery<ListSavedViewsInput, SavedViewRow[], SavedViewStoreError>;
