import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { and, dbOperationFailure, desc, eq, lt, resolveExecutor } from "@packages/drizzle";
import * as notificationSchema from "../../../schemas/notification";
import type { NotificationError } from "../../application/ports/repositories/notification.port";
import type {
  IListNotificationsQuery,
  NotificationFeedRequest,
  NotificationPage,
} from "../../application/queries/list-notifications.query";
import { toNotificationRecord } from "../repos/drizzle/notification.mapper";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const readFailure = dbOperationFailure("NOTIFICATION_PROVIDER_FAILURE");

const n = notificationSchema.notification;

export class DrizzleListNotificationsQuery implements IListNotificationsQuery {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async execute(
    request: NotificationFeedRequest,
  ): Promise<Result<NotificationPage, NotificationError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleListNotificationsQuery > execute" },
      async () => {
        try {
          const owned = eq(n.userId, request.userId);
          const where = request.cursor.isSome()
            ? and(owned, lt(n.createdAt, request.cursor.unwrap()))
            : owned;
          const query = exec
            .select()
            .from(n)
            .where(where)
            .orderBy(desc(n.createdAt))
            .limit(request.limit);
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          const items = rows.map(toNotificationRecord);
          const last = items.at(-1);
          const nextCursor =
            items.length === request.limit && last
              ? Option.some(last.createdAt)
              : Option.none<Date>();

          return Result.ok({ items, nextCursor });
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(readFailure("list"));
        }
      },
    );
  }
}
