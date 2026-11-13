import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { and, dbOperationFailure, eq, inArray, isNull, resolveExecutor } from "@packages/drizzle";
import * as notificationSchema from "../../../../schemas/notification";
import type {
  INotificationStore,
  NotificationError,
  PreferenceRecord,
} from "../../../application/ports/repositories/notification.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const writeFailure = dbOperationFailure("NOTIFICATION_WRITE_PROVIDER_FAILURE");

const n = notificationSchema.notification;
const p = notificationSchema.notificationPreference;

export class DrizzleNotificationRepository implements INotificationStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async markRead(
    userId: string,
    ids: string[],
    now: Date,
  ): Promise<Result<string[], NotificationError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleNotificationRepository > markRead" },
      async () => {
        try {
          const query = exec
            .update(n)
            .set({ readAt: now })
            .where(and(eq(n.userId, userId), inArray(n.id, ids)))
            .returning({ id: n.id });
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(rows.map((row) => row.id));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(writeFailure("markRead"));
        }
      },
    );
  }

  async markAllRead(userId: string, now: Date): Promise<Result<string[], NotificationError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleNotificationRepository > markAllRead" },
      async () => {
        try {
          const query = exec
            .update(n)
            .set({ readAt: now })
            .where(and(eq(n.userId, userId), isNull(n.readAt)))
            .returning({ id: n.id });
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(rows.map((row) => row.id));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(writeFailure("markAllRead"));
        }
      },
    );
  }

  async upsertPreference(preference: PreferenceRecord): Promise<Result<void, NotificationError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleNotificationRepository > upsertPreference" },
      async () => {
        try {
          const query = exec
            .insert(p)
            .values({
              id: crypto.randomUUID(),
              scope: preference.scope,
              scopeId: preference.scopeId,
              category: preference.category,
              channel: preference.channel,
              enabled: preference.enabled,
              frequency: preference.frequency,
              locked: preference.locked,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [p.scope, p.scopeId, p.category, p.channel],
              set: {
                enabled: preference.enabled,
                frequency: preference.frequency,
                locked: preference.locked,
                updatedAt: new Date(),
              },
            });
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(writeFailure("upsertPreference"));
        }
      },
    );
  }
}
