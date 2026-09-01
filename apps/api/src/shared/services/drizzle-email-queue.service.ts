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

export class DrizzleEmailQueue implements IEmailQueue {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async enqueue(
    rows: EmailMessageInsert[],
    tx?: ITransaction,
  ): Promise<Result<{ written: number }, EmailQueueError>> {
    const exec = tx ?? db;
    return this.instrumentation.startSpan({ name: "DrizzleEmailQueue > enqueue" }, async () => {
      if (rows.length === 0) return Result.ok<{ written: number }, EmailQueueError>({ written: 0 });
      try {
        const values = rows.map((r) => ({
          id: uuidv7(),
          kind: r.kind,
          template: r.template.isSome() ? r.template.unwrap() : null,
          toAddress: r.toAddress,
          subject: r.subject,
          locale: r.locale,
          payload: r.payload,
          status: "pending" as const,
          attempts: 0,
          nextAttemptAt: null,
          idempotencyKey: r.idempotencyKey.isSome() ? r.idempotencyKey.unwrap() : null,
        }));
        const query = exec
          .insert(emailSchema.emailMessage)
          .values(values)
          .onConflictDoNothing({ target: emailSchema.emailMessage.idempotencyKey })
          .returning({ id: emailSchema.emailMessage.id });
        const written = await this.instrumentation.startSpan(
          {
            name: "insert into email_message",
            op: "db.query",
            attributes: { "db.system.name": "postgresql" },
          },
          () => query,
        );
        if (written.length < values.length) {
          logger.warn(
            { requested: values.length, written: written.length },
            "email enqueue suppressed duplicate rows — idempotency keys already present",
          );
        }
        return Result.ok<{ written: number }, EmailQueueError>({ written: written.length });
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail({
          code: "EMAIL_QUEUE_WRITE_FAILED",
          message: err instanceof Error ? err.message : "enqueue failed",
        });
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
        const em = emailSchema.emailMessage;
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
            {
              name: query.toSQL().sql,
              op: "db.query",
              attributes: { "db.system.name": "postgresql" },
            },
            () => query.execute(),
          );
          return Result.ok<EmailMessageRecord[], EmailQueueError>(
            rows.map((r) => ({
              ...r,
              template: Option.fromNullable(r.template),
              locale: Option.fromNullable(isLocale(r.locale) ? r.locale : null),
              nextAttemptAt: Option.fromNullable(r.nextAttemptAt),
              lastError: Option.fromNullable(r.lastError),
              idempotencyKey: Option.fromNullable(r.idempotencyKey),
            })),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail({
            code: "EMAIL_QUEUE_WRITE_FAILED",
            message: err instanceof Error ? err.message : "claim failed",
          });
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
      if (ids.length === 0) return Result.ok<void, EmailQueueError>(undefined);

      const em = emailSchema.emailMessage;
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
          {
            name: query.toSQL().sql,
            op: "db.query",
            attributes: { "db.system.name": "postgresql" },
          },
          () => query.execute(),
        );

        return Result.ok<void, EmailQueueError>(undefined);
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail({
          code: "EMAIL_QUEUE_WRITE_FAILED",
          message: err instanceof Error ? err.message : "markSent failed",
        });
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
      const em = emailSchema.emailMessage;
      try {
        const query = tx
          .update(em)
          .set({
            status: nextAttempt.isNone() ? "failed" : "pending",
            nextAttemptAt: nextAttempt.isSome() ? nextAttempt.unwrap() : null,
            lastError: error.slice(0, 2000),
            attempts: sql`${em.attempts} + 1`,
          })
          .where(eq(em.id, id));
        await query.execute();
        return Result.ok<void, EmailQueueError>(undefined);
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail({
          code: "EMAIL_QUEUE_WRITE_FAILED",
          message: err instanceof Error ? err.message : "markFailed failed",
        });
      }
    });
  }
}
