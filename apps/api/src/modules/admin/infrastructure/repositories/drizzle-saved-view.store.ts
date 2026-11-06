import { type StaffView, type StaffViewScreen, storedStaffView } from "@packages/access-control";
import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { and, asc, dbNow, eq, inArray, resolveExecutor, staffSchema } from "@packages/drizzle";
import { dbOperationFailure } from "../../../../shared/db-failure";
import type {
  DeletedSavedView,
  ISavedViewStore,
  SavedViewRow,
  SavedViewStoreError,
} from "../../application/ports/saved-view-store.port";

const { savedView } = staffSchema;
const failure = dbOperationFailure("ADMIN_VIEW_PROVIDER_FAILURE");
const dbAttrs = { "db.system.name": "postgresql" } as const;

export class DrizzleSavedViewStore implements ISavedViewStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  private viewsOf(rows: (typeof savedView.$inferSelect)[]): SavedViewRow[] {
    return rows.flatMap((row) => {
      const view = storedStaffView(row);
      if (view) return [{ ...view, id: row.id }];

      this.instrumentation.capture(new Error(`saved view ${row.id} has no screen or name left`));

      return [];
    });
  }

  async list(
    ownerId: string,
    screens: StaffViewScreen[],
    limit: number,
  ): Promise<Result<SavedViewRow[], SavedViewStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleSavedViewStore > list" }, async () => {
      try {
        const query = exec
          .select()
          .from(savedView)
          .where(and(eq(savedView.ownerId, ownerId), inArray(savedView.screen, screens)))
          .orderBy(asc(savedView.screen), asc(savedView.name))
          .limit(limit);
        const rows = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(this.viewsOf(rows));
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(failure("list saved views"));
      }
    });
  }

  async save(
    ownerId: string,
    id: string,
    view: StaffView,
  ): Promise<Result<string, SavedViewStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleSavedViewStore > save" }, async () => {
      try {
        const query = exec
          .insert(savedView)
          .values({ id, ownerId, screen: view.screen, name: view.name, filters: view.filters })
          .onConflictDoUpdate({
            target: [savedView.ownerId, savedView.screen, savedView.name],
            set: { filters: view.filters, updatedAt: dbNow },
          })
          .returning({ id: savedView.id });
        const [row] = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(row?.id ?? id);
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(failure("save saved view"));
      }
    });
  }

  async remove(
    ownerId: string,
    id: string,
  ): Promise<Result<Option<DeletedSavedView>, SavedViewStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleSavedViewStore > remove" }, async () => {
      try {
        const query = exec
          .delete(savedView)
          .where(and(eq(savedView.id, id), eq(savedView.ownerId, ownerId)))
          .returning({ id: savedView.id, screen: savedView.screen });
        const [row] = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(Option.fromNullable(row));
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(failure("delete saved view"));
      }
    });
  }
}
