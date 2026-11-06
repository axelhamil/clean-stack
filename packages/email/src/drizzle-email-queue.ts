import { type IInstrumentation, type ILogger, Option, Result, uuidv7 } from "@packages/ddd-kit";
import {
  and,
  claimedSet,
  count,
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
import type {
  EmailClaimRequest,
  EmailFailure,
  EmailLease,
  EmailMessageInsert,
  EmailMessageRecord,
  EmailQueueError,
  IEmailQueue,
} from "./email-queue.port";

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
  const claimable = { id: em.id, createdAt: em.createdAt, batchKey: em.batchKey };
  const inWindow = gt(em.createdAt, sql`now() - make_interval(hours => ${deadReplayWindowHours})`);
  const pendingDue = and(eq(em.status, "pending"), isDue(em.nextAttemptAt));
  const deadDue = and(eq(em.status, "dead"), isDeadDue(em.nextAttemptAt), inWindow);
  const replayable = and(unsettled, or(eq(em.status, "pending"), inWindow));
  const live = db
    .$with("live")
    .as(
      db
        .select(claimable)
        .from(em)
        .where(pendingDue)
        .orderBy(em.createdAt)
        .limit(limit)
        .for("update", { skipLocked: true }),
    );
  const dead = db
    .$with("dead")
    .as(
      db
        .select(claimable)
        .from(em)
        .where(deadDue)
        .orderBy(em.nextAttemptAt)
        .limit(deadShareOf(limit))
        .for("update", { skipLocked: true }),
    );
  const picked = db
    .$with("picked")
    .as(
      db.select().from(live).unionAll(db.select().from(dead)).orderBy(live.createdAt).limit(limit),
    );
  const siblings = db.$with("siblings").as(
    db
      .select(claimable)
      .from(em)
      .where(
        and(
          inArray(em.batchKey, db.select({ batchKey: picked.batchKey }).from(picked)),
          or(pendingDue, deadDue),
        ),
      )
      .for("update", { skipLocked: true }),
  );
  const due = db.$with("due").as(db.select().from(picked).union(db.select().from(siblings)));
  const batchSizes = db.$with("batch_sizes").as(
    db
      .select({ batchKey: em.batchKey, unsettled: count().as("unsettled") })
      .from(em)
      .where(and(inArray(em.batchKey, db.select({ batchKey: due.batchKey }).from(due)), replayable))
      .groupBy(em.batchKey),
  );

  return exec
    .with(live, dead, picked, siblings, due, batchSizes)
    .update(em)
    .set(claimedSet(em, leaseSeconds))
    .from(due)
    .leftJoin(batchSizes, eq(batchSizes.batchKey, due.batchKey))
    .where(and(eq(em.id, due.id), unsettled))
    .returning({ ...getTableColumns(em), unsettledInBatch: batchSizes.unsettled });
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

function toRecord(
  row: typeof em.$inferSelect & { unsettledInBatch: number | null },
): EmailMessageRecord {
  return {
    ...row,
    template: Option.fromNullable(row.template),
    locale: Option.fromNullable(isLocale(row.locale) ? row.locale : null),
    nextAttemptAt: Option.fromNullable(row.nextAttemptAt),
    lastError: Option.fromNullable(row.lastError),
    idempotencyKey: Option.fromNullable(row.idempotencyKey),
    batchKey: Option.fromNullable(row.batchKey),
    unsettledInBatch: Option.fromNullable(row.unsettledInBatch),
  };
}

export class DrizzleEmailQueue implements IEmailQueue {
  constructor(
    private readonly instrumentation: IInstrumentation,
    private readonly logger: ILogger,
  ) {}

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
          this.logger.warn(
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
    return this.updateLeased("markSent", leases, () => {
      const cases = leases.map(
        ({ id }) => sql`WHEN ${em.id} = ${id} THEN ${providerMessageIds[id] ?? null}`,
      );

      return {
        status: "sent",
        sentAt: dbNow,
        nextAttemptAt: null,
        lastError: null,
        providerMessageId: sql`CASE ${sql.join(cases, sql` `)} ELSE NULL END`,
      };
    });
  }

  async assignBatch(
    leases: EmailLease[],
    batchKey: string,
  ): Promise<Result<EmailLease[], EmailQueueError>> {
    return this.updateLeased("assignBatch", leases, () => ({ batchKey }));
  }

  private async updateLeased(
    method: string,
    leases: EmailLease[],
    changes: () => PgUpdateSetSource<typeof em>,
  ): Promise<Result<EmailLease[], EmailQueueError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan({ name: `DrizzleEmailQueue > ${method}` }, async () => {
      if (leases.length === 0) return Result.ok([]);

      try {
        const query = exec
          .update(em)
          .set(changes())
          .where(leasedAll(leases))
          .returning({ id: em.id, attempts: em.attempts });
        const written = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(written);
      } catch (err) {
        this.instrumentation.capture(err);
        return fail(err, `${method} failed`);
      }
    });
  }

  async markFailed(
    leases: EmailLease[],
    failure: EmailFailure,
  ): Promise<Result<EmailLease[], EmailQueueError>> {
    return this.updateLeased("markFailed", leases, () => failureChanges(failure));
  }

  async release(leases: EmailLease[], delaySeconds = 0): Promise<Result<number, EmailQueueError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan({ name: "DrizzleEmailQueue > release" }, async () => {
      if (leases.length === 0) return Result.ok(0);

      try {
        const query = exec
          .update(em)
          .set({ ...releasedSet(em), nextAttemptAt: secondsFromNow(delaySeconds) })
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
