import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { and, count, dbOperationFailure, eq, isNull, resolveExecutor } from "@packages/drizzle";
import * as notificationSchema from "../../../schemas/notification";
import type { NotificationError } from "../../application/ports/repositories/notification.port";
import type {
  IGetUnreadCountQuery,
  UnreadCountRequest,
} from "../../application/queries/get-unread-count.query";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const readFailure = dbOperationFailure("NOTIFICATION_PROVIDER_FAILURE");

const n = notificationSchema.notification;

export class DrizzleGetUnreadCountQuery implements IGetUnreadCountQuery {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async execute(request: UnreadCountRequest): Promise<Result<number, NotificationError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleGetUnreadCountQuery > execute" },
      async () => {
        try {
          const query = exec
            .select({ count: count() })
            .from(n)
            .where(and(eq(n.userId, request.userId), isNull(n.readAt)));
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(rows[0]?.count ?? 0);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(readFailure("unreadCount"));
        }
      },
    );
  }
}
