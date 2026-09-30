import { Option, Result, uuidv7 } from "@packages/ddd-kit";
import { and, db, emailSchema, eq, inArray, isNull, lte, or, sql } from "@packages/drizzle";
import { isLocale } from "@packages/i18n";
import { logger } from "../logger";
import type {
  EmailMessageInsert,
  EmailMessageRecord,
  EmailQueueError,
  IEmailQueue,
} from "../ports/email-queue.port";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { ITransaction } from "../transaction";

const em = emailSchema.emailMessage;
const dbAttrs = { "db.system.name": "postgresql" } as const;

function fail(err: unknown, fallback: string): Result<never, EmailQueueError> {
  return Result.fail({
    code: "EMAIL_QUEUE_WRITE_FAILED",
    message: err instanceof Error ? err.message : fallback,
  });
}

function toRecord(row: typeof em.$inferSelect): EmailMessageRecord {
  return {
    ...row,
    template: Option.fromNullable(row.template),
    locale: Option.fromNullable(isLocale(row.locale) ? row.locale : null),
    nextAttemptAt: Option.fromNullable(row.nextAttemptAt),
    lastError: Option.fromNullable(row.lastError),
    idempotencyKey: Option.fromNullable(row.idempotencyKey),
  };
}

export class DrizzleEmailQueue implements IEmailQueue {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async enqueue(
    rows: EmailMessageInsert[],
    tx?: ITransaction,
  ): Promise<Result<{ written: number }, EmailQueueError>> {
    const exec = tx ?? db;
    return this.instrumentation.startSpan({ name: "DrizzleEmailQueue > enqueue" }, async () => {
      if (rows.length === 0) return Result.ok({ written: 0 });

      try {
        const values = rows.map((r) => ({
          id: uuidv7(),
          kind: r.kind,
          template: r.template.toNull(),
          toAddress: r.toAddress,
          subject: r.subject,
          locale: r.locale,
          payload: r.payload,
          status: "pending" as const,
          attempts: 0,
          nextAttemptAt: null,
          idempotencyKey: r.idempotencyKey.toNull(),
        }));
        const query = exec
          .insert(em)
          .values(values)
          .onConflictDoNothing({ target: em.idempotencyKey })
          .returning({ id: em.id });
        const written = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        if (written.length < values.length) {
          logger.warn(
            { requested: values.length, written: written.length },
            "email enqueue suppressed duplicate rows: idempotency keys already present",
          );
        }
        return Result.ok({ written: written.length });
      } catch (err) {
        this.instrumentation.capture(err);
        return fail(err, "enqueue failed");
      }
    });
  }

  async claimPending(
    limit: number,
    claimUntil: Date,
    tx: ITransaction,
  ): Promise<Result<EmailMessageRecord[], EmailQueueError>> {
    return this.instrumentation.startSpan(
      { name: "DrizzleEmailQueue > claimPending" },
      async () => {
        try {
          const subq = tx
            .select({ id: em.id })
            .from(em)
            .where(
              and(
                eq(em.status, "pending"),
                or(isNull(em.nextAttemptAt), lte(em.nextAttemptAt, new Date())),
              ),
            )
            .orderBy(em.createdAt)
            .limit(limit)
            .for("update", { skipLocked: true });

          const query = tx
            .update(em)
            .set({ nextAttemptAt: claimUntil })
            .where(inArray(em.id, subq))
            .returning();

          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(rows.map(toRecord));
        } catch (err) {
          this.instrumentation.capture(err);
          return fail(err, "claim failed");
        }
      },
    );
  }

  async markSent(
    ids: string[],
    sentAt: Date,
    providerMessageIds: Record<string, string>,
    tx: ITransaction,
  ): Promise<Result<void, EmailQueueError>> {
    return this.instrumentation.startSpan({ name: "DrizzleEmailQueue > markSent" }, async () => {
      if (ids.length === 0) return Result.ok();

      try {
        const cases = ids.map(
          (id) => sql`WHEN ${em.id} = ${id} THEN ${providerMessageIds[id] ?? null}`,
        );
        const providerCase = sql`CASE ${sql.join(cases, sql` `)} ELSE NULL END`;

        const query = tx
          .update(em)
          .set({
            status: "sent",
            sentAt,
            nextAttemptAt: null,
            lastError: null,
            providerMessageId: providerCase,
            attempts: sql`${em.attempts} + 1`,
          })
          .where(inArray(em.id, ids));

        await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );
        return Result.ok();
      } catch (err) {
        this.instrumentation.capture(err);
        return fail(err, "markSent failed");
      }
    });
  }

  async markFailed(
    id: string,
    error: string,
    nextAttempt: Option<Date>,
    tx: ITransaction,
  ): Promise<Result<void, EmailQueueError>> {
    return this.instrumentation.startSpan({ name: "DrizzleEmailQueue > markFailed" }, async () => {
      try {
        const query = tx
          .update(em)
          .set({
            status: nextAttempt.isNone() ? "failed" : "pending",
            nextAttemptAt: nextAttempt.toNull(),
            lastError: error.slice(0, 2000),
            attempts: sql`${em.attempts} + 1`,
          })
          .where(eq(em.id, id));
        await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );
        return Result.ok();
      } catch (err) {
        this.instrumentation.capture(err);
        return fail(err, "markFailed failed");
      }
    });
  }
}
