import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import {
  alias,
  and,
  authSchema,
  count,
  dbOperationFailure,
  eq,
  inArray,
  isNull,
  lte,
  notificationSchema,
  resolveExecutor,
  sql,
  tryLockForTransaction,
} from "@packages/drizzle";
import { NOTIFICATION_MAP } from "@packages/events";
import type {
  DueNotification,
  INotificationDigestStore,
  NotificationDigestError,
} from "../../../../shared/ports/notification-digest.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const storeFailure = dbOperationFailure("NOTIFICATION_DIGEST_PROVIDER_FAILURE");

const n = notificationSchema.notification;
const u = authSchema.user;

// Forced notifications (security, payment failures, …) join no preference row
// at the fan-out either, the flush must honour the exact same exemption, or a
// user who disabled email for `security` would silently start losing forced
// digests it was never allowed to defer in the first place.
const FORCED_EVENT_TYPES = Object.entries(NOTIFICATION_MAP)
  .filter(([, config]) => config?.forced === true)
  .map(([eventType]) => eventType);

const p = notificationSchema.notificationPreference;
const upMail = alias(p, "up_mail");
const opMail = alias(p, "op_mail");

/**
 * Same precedence the fan-out resolves at insertion (`notification-fanout-
 * subscriber.ts`): org-locked wins, then the user's own choice, then the
 * org's unlocked default, then `TRUE`. Re-evaluated here, at send time,
 * against the *current* row, a preference flipped after the notification
 * was queued must be able to cancel a digest already scheduled.
 */
const forcedCheck =
  FORCED_EVENT_TYPES.length > 0
    ? sql`${n.eventType} IN (${sql.join(
        FORCED_EVENT_TYPES.map((t) => sql`${t}`),
        sql`, `,
      )})`
    : sql`FALSE`;

const emailStillWanted = sql<boolean>`(
  ${forcedCheck}
  OR COALESCE(
    CASE WHEN ${opMail.locked} THEN ${opMail.enabled} END,
    ${upMail.enabled},
    ${opMail.enabled},
    TRUE
  )
)`;

const isDueAt = (now: Date) => and(lte(n.emailPendingAt, now), isNull(n.emailSentAt));

export class DrizzleNotificationDigestStore implements INotificationDigestStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async countDue(now: Date): Promise<Result<number, NotificationDigestError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleNotificationDigestStore > countDue" },
      async () => {
        try {
          const query = exec.select({ eligible: count() }).from(n).where(isDueAt(now));
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(row?.eligible ?? 0);
        } catch (err) {
          this.instrumentation.capture(err);

          return Result.fail(storeFailure("countDue"));
        }
      },
    );
  }

  async beginFlush(lockKey: string): Promise<Result<boolean, NotificationDigestError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleNotificationDigestStore > beginFlush" },
      async () => {
        try {
          if (!(await tryLockForTransaction(lockKey))) return Result.ok(false);

          await exec.execute(sql`SET LOCAL statement_timeout = '30s'`);
          await exec.execute(sql`SET LOCAL lock_timeout = '500ms'`);
          await exec.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '10s'`);

          return Result.ok(true);
        } catch (err) {
          this.instrumentation.capture(err);

          return Result.fail(storeFailure("beginFlush"));
        }
      },
    );
  }

  async claimDue(
    now: Date,
    limit: number,
  ): Promise<Result<DueNotification[], NotificationDigestError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleNotificationDigestStore > claimDue" },
      async () => {
        try {
          const query = exec
            .select({
              id: n.id,
              userId: n.userId,
              category: n.category,
              eventType: n.eventType,
              email: u.email,
              locale: u.locale,
              payload: n.payload,
              emailStillWanted,
            })
            .from(n)
            .innerJoin(u, eq(n.userId, u.id))
            .leftJoin(
              upMail,
              and(
                eq(upMail.scope, "user"),
                eq(upMail.channel, "email"),
                eq(upMail.category, n.category),
                eq(upMail.scopeId, n.userId),
              ),
            )
            .leftJoin(
              opMail,
              and(
                eq(opMail.scope, "org"),
                eq(opMail.channel, "email"),
                eq(opMail.category, n.category),
                eq(opMail.scopeId, n.organizationId),
              ),
            )
            .where(isDueAt(now))
            .limit(limit)
            .for("update", { of: n, skipLocked: true });

          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(
            rows.map((row) => ({ ...row, locale: Option.fromNullable(row.locale) })),
          );
        } catch (err) {
          this.instrumentation.capture(err);

          return Result.fail(storeFailure("claimDue"));
        }
      },
    );
  }

  async dropUnwanted(ids: string[]): Promise<Result<void, NotificationDigestError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleNotificationDigestStore > dropUnwanted" },
      async () => {
        try {
          const query = exec.update(n).set({ emailPendingAt: null }).where(inArray(n.id, ids));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);

          return Result.fail(storeFailure("dropUnwanted"));
        }
      },
    );
  }

  async markSent(ids: string[], sentAt: Date): Promise<Result<void, NotificationDigestError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleNotificationDigestStore > markSent" },
      async () => {
        try {
          const query = exec.update(n).set({ emailSentAt: sentAt }).where(inArray(n.id, ids));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);

          return Result.fail(storeFailure("markSent"));
        }
      },
    );
  }
}
