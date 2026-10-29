import { Option, Result, uuidv7 } from "@packages/ddd-kit";
import {
  and,
  claimedSet,
  db,
  dbNow,
  deadShareOf,
  emailSchema,
  eq,
  getTableColumns,
  gt,
  inArray,
  isDeadDue,
  isDue,
  leasedBy,
  or,
  type PgUpdateSetSource,
  releasedSet,
  resolveExecutor,
  type SQL,
  secondsFromNow,
  sql,
} from "@packages/drizzle";
import { isLocale } from "@packages/i18n";
import { logger } from "../logger";
import type {
  EmailClaimRequest,
  EmailFailure,
  EmailLease,
  EmailMessageInsert,
  EmailMessageRecord,
  EmailQueueError,
  IEmailQueue,
} from "../ports/email-queue.port";
import type { IInstrumentation } from "../ports/instrumentation.port";

const em = emailSchema.emailMessage;
const dbAttrs = { "db.system.name": "postgresql" } as const;

function fail(err: unknown, fallback: string): Result<never, EmailQueueError> {
  return Result.fail({
    code: "EMAIL_QUEUE_WRITE_FAILED",
    message: err instanceof Error ? err.message : fallback,
  });
}

const LAST_ERROR_MAX_LENGTH = 2000;
const unsettled = inArray(em.status, ["pending", "dead"]);
const leasedAll = (leases: readonly EmailLease[]): SQL | undefined =>
  and(or(...leases.map((lease) => leasedBy(em, lease))), unsettled);

function claimQuery(
  exec: ReturnType<typeof resolveExecutor>,
  { limit, leaseSeconds, deadReplayWindowHours }: EmailClaimRequest,
) {
  const claimable = { id: em.id, createdAt: em.createdAt };
  const live = db.$with("live").as(
    db
      .select(claimable)
      .from(em)
      .where(and(eq(em.status, "pending"), isDue(em.nextAttemptAt)))
      .orderBy(em.createdAt)
      .limit(limit)
      .for("update", { skipLocked: true }),
  );
  const dead = db.$with("dead").as(
    db
      .select(claimable)
      .from(em)
      .where(
        and(
          eq(em.status, "dead"),
          isDeadDue(em.nextAttemptAt),
          gt(em.createdAt, sql`now() - make_interval(hours => ${deadReplayWindowHours})`),
        ),
      )
      .orderBy(em.nextAttemptAt)
      .limit(deadShareOf(limit))
      .for("update", { skipLocked: true }),
  );
  const due = db
    .$with("due")
    .as(
      db.select().from(live).unionAll(db.select().from(dead)).orderBy(live.createdAt).limit(limit),
    );

  return exec
    .with(live, dead, due)
    .update(em)
    .set(claimedSet(em, leaseSeconds))
    .from(due)
    .where(eq(em.id, due.id))
    .returning(getTableColumns(em));
}

function failureChanges(failure: EmailFailure): PgUpdateSetSource<typeof em> {
  const lastError = failure.lastError.slice(0, LAST_ERROR_MAX_LENGTH);
  if (failure.status === "failed") return { status: "failed", lastError, nextAttemptAt: null };

  return {
    status: failure.status,
    lastError,
    nextAttemptAt: secondsFromNow(failure.retryAfterSeconds),
  };
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

  async enqueue(rows: EmailMessageInsert[]): Promise<Result<{ written: number }, EmailQueueError>> {
    const exec = resolveExecutor();
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

  async claim(request: EmailClaimRequest): Promise<Result<EmailMessageRecord[], EmailQueueError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan({ name: "DrizzleEmailQueue > claim" }, async () => {
      try {
        const query = claimQuery(exec, request);
        const rows = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(
          rows
            .map(toRecord)
            .sort(
              (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
            ),
        );
      } catch (err) {
        this.instrumentation.capture(err);
        return fail(err, "claim failed");
      }
    });
  }

  async markSent(
    leases: EmailLease[],
    providerMessageIds: Record<string, string>,
  ): Promise<Result<EmailLease[], EmailQueueError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan({ name: "DrizzleEmailQueue > markSent" }, async () => {
      if (leases.length === 0) return Result.ok([]);

      try {
        const cases = leases.map(
          ({ id }) => sql`WHEN ${em.id} = ${id} THEN ${providerMessageIds[id] ?? null}`,
        );
        const providerCase = sql`CASE ${sql.join(cases, sql` `)} ELSE NULL END`;
        const query = exec
          .update(em)
          .set({
            status: "sent",
            sentAt: dbNow,
            nextAttemptAt: null,
            lastError: null,
            providerMessageId: providerCase,
          })
          .where(leasedAll(leases))
          .returning({ id: em.id, attempts: em.attempts });
        const written = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(written);
      } catch (err) {
        this.instrumentation.capture(err);
        return fail(err, "markSent failed");
      }
    });
  }

  async markFailed(
    lease: EmailLease,
    failure: EmailFailure,
  ): Promise<Result<boolean, EmailQueueError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan({ name: "DrizzleEmailQueue > markFailed" }, async () => {
      try {
        const query = exec
          .update(em)
          .set(failureChanges(failure))
          .where(leasedAll([lease]))
          .returning({ id: em.id });
        const written = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(written.length > 0);
      } catch (err) {
        this.instrumentation.capture(err);
        return fail(err, "markFailed failed");
      }
    });
  }

  async release(leases: EmailLease[]): Promise<Result<number, EmailQueueError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan({ name: "DrizzleEmailQueue > release" }, async () => {
      if (leases.length === 0) return Result.ok(0);

      try {
        const query = exec
          .update(em)
          .set(releasedSet(em))
          .where(leasedAll(leases))
          .returning({ id: em.id });
        const written = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(written.length);
      } catch (err) {
        this.instrumentation.capture(err);
        return fail(err, "release failed");
      }
    });
  }
}
