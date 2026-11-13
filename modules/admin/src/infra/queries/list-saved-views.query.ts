import { screensOpenTo } from "@packages/access-control";
import type { IInstrumentation, Result } from "@packages/ddd-kit";
import type {
  ISavedViewStore,
  SavedViewRow,
  SavedViewStoreError,
} from "../../application/ports/repositories/saved-view-store.port";
import type {
  IListSavedViewsQuery,
  ListSavedViewsInput,
} from "../../application/queries/list-saved-views.query";

export const SAVED_VIEWS_LIMIT = 200;

export class SavedViewListQuery implements IListSavedViewsQuery {
  constructor(
    private readonly views: ISavedViewStore,
    private readonly instrumentation: IInstrumentation,
  ) {}

  execute(input: ListSavedViewsInput): Promise<Result<SavedViewRow[], SavedViewStoreError>> {
    return this.instrumentation.startSpan({ name: "SavedViewListQuery > execute" }, () =>
      this.views.list(input.ownerId, screensOpenTo(input.permissions), SAVED_VIEWS_LIMIT),
    );
  }
}
