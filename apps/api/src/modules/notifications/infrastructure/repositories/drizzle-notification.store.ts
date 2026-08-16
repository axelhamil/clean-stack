import { Option, Result } from "@packages/ddd-kit";
import {
  and,
  count,
  db,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  notificationSchema,
} from "@packages/drizzle";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type {
  INotificationStore,
  NotificationError,
  NotificationRecord,
  PreferenceInput,
  PreferenceRecord,
  PreferenceScope,
} from "../../application/ports/notification.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

function readFailure(err: unknown): NotificationError {
  return {
    code: "NOTIFICATION_PROVIDER_FAILURE",
    message: err instanceof Error ? err.message : "unknown",
  };
}

function writeFailure(err: unknown): NotificationError {
  return {
    code: "NOTIFICATION_WRITE_PROVIDER_FAILURE",
    message: err instanceof Error ? err.message : "unknown",
  };
}

export class DrizzleNotificationStore implements INotificationStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async list(
    userId: string,
    cursor: Option<string>,
    limit: number,
  ): Promise<Result<NotificationRecord[], NotificationError>> {
    return this.instrumentation.startSpan({ name: "DrizzleNotificationStore > list" }, async () => {
      try {
        const n = notificationSchema.notification;
        const where = cursor.isSome()
          ? and(eq(n.userId, userId), lt(n.createdAt, new Date(cursor.unwrap())))
          : eq(n.userId, userId);
        const query = db.select().from(n).where(where).orderBy(desc(n.createdAt)).limit(limit);
        const rows = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );
        return Result.ok(rows.map((row) => this.toRecord(row)));
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(readFailure(err));
      }
    });
  }

  async unreadCount(userId: string): Promise<Result<number, NotificationError>> {
    return this.instrumentation.startSpan(
      { name: "DrizzleNotificationStore > unreadCount" },
      async () => {
        try {
          const n = notificationSchema.notification;
          const query = db
            .select({ count: count() })
            .from(n)
            .where(and(eq(n.userId, userId), isNull(n.readAt)));
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(rows[0]?.count ?? 0);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(readFailure(err));
        }
      },
    );
  }

  async markRead(
    userId: string,
    ids: string[],
    now: Date,
  ): Promise<Result<void, NotificationError>> {
    return this.instrumentation.startSpan(
      { name: "DrizzleNotificationStore > markRead" },
      async () => {
        try {
          const n = notificationSchema.notification;
          const query = db
            .update(n)
            .set({ readAt: now })
            .where(and(eq(n.userId, userId), inArray(n.id, ids)));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(writeFailure(err));
        }
      },
    );
  }

  async markAllRead(userId: string, now: Date): Promise<Result<void, NotificationError>> {
    return this.instrumentation.startSpan(
      { name: "DrizzleNotificationStore > markAllRead" },
      async () => {
        try {
          const n = notificationSchema.notification;
          const query = db
            .update(n)
            .set({ readAt: now })
            .where(and(eq(n.userId, userId), isNull(n.readAt)));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(writeFailure(err));
        }
      },
    );
  }

  async listPreferences(
    scope: PreferenceScope,
    scopeId: string,
  ): Promise<Result<PreferenceRecord[], NotificationError>> {
    return this.instrumentation.startSpan(
      { name: "DrizzleNotificationStore > listPreferences" },
      async () => {
        try {
          const p = notificationSchema.notificationPreference;
          const query = db
            .select()
            .from(p)
            .where(and(eq(p.scope, scope), eq(p.scopeId, scopeId)));
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(rows.map((row) => this.toPreference(row)));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(readFailure(err));
        }
      },
    );
  }

  async upsertPreference(input: PreferenceInput): Promise<Result<void, NotificationError>> {
    return this.instrumentation.startSpan(
      { name: "DrizzleNotificationStore > upsertPreference" },
      async () => {
        try {
          const p = notificationSchema.notificationPreference;
          const query = db
            .insert(p)
            .values({
              id: crypto.randomUUID(),
              scope: input.scope,
              scopeId: input.scopeId,
              category: input.category,
              channel: input.channel,
              enabled: input.enabled,
              frequency: input.frequency,
              locked: input.locked,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [p.scope, p.scopeId, p.category, p.channel],
              set: {
                enabled: input.enabled,
                frequency: input.frequency,
                locked: input.locked,
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
          return Result.fail(writeFailure(err));
        }
      },
    );
  }

  private toRecord(row: typeof notificationSchema.notification.$inferSelect): NotificationRecord {
    return {
      id: row.id,
      userId: row.userId,
      organizationId: Option.fromNullable(row.organizationId),
      category: row.category,
      eventType: row.eventType,
      groupKey: Option.fromNullable(row.groupKey),
      payload: row.payload,
      readAt: Option.fromNullable(row.readAt),
      createdAt: row.createdAt,
    };
  }

  private toPreference(
    row: typeof notificationSchema.notificationPreference.$inferSelect,
  ): PreferenceRecord {
    return {
      scope: row.scope,
      scopeId: row.scopeId,
      category: row.category,
      channel: row.channel,
      enabled: row.enabled,
      frequency: row.frequency,
      locked: row.locked,
    };
  }
}
