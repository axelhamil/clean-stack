import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { and, dbOperationFailure, eq, resolveExecutor } from "@packages/drizzle";
import * as notificationSchema from "../../../schemas/notification";
import type {
  NotificationError,
  PreferenceRecord,
} from "../../application/ports/repositories/notification.port";
import type {
  IListPreferencesQuery,
  PreferencesRequest,
} from "../../application/queries/list-preferences.query";
import { toPreferenceRecord } from "../repos/drizzle/notification.mapper";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const readFailure = dbOperationFailure("NOTIFICATION_PROVIDER_FAILURE");

const p = notificationSchema.notificationPreference;

export class DrizzleListPreferencesQuery implements IListPreferencesQuery {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async execute(
    request: PreferencesRequest,
  ): Promise<Result<PreferenceRecord[], NotificationError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleListPreferencesQuery > execute" },
      async () => {
        try {
          const query = exec
            .select()
            .from(p)
            .where(and(eq(p.scope, request.scope), eq(p.scopeId, request.scopeId)));
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(rows.map(toPreferenceRecord));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(readFailure("listPreferences"));
        }
      },
    );
  }
}
