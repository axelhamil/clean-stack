import type { ApprovalAction } from "@packages/access-control";
import { isApprovalAction } from "@packages/access-control";
import {
  createDbFailure,
  type IInstrumentation,
  type ILogger,
  type IUnitOfWork,
  Option,
  Result,
} from "@packages/ddd-kit";
import {
  and,
  asc,
  count,
  dbNow,
  desc,
  eq,
  gt,
  inArray,
  lt,
  or,
  resolveExecutor,
  secondsFromNow,
  sql,
} from "@packages/drizzle";
import { countEligibleWithTimeout } from "@packages/drizzle/sweep-count";
import { lockedBatch, requireFilter, withSweepGuards } from "@packages/drizzle/sweep-purge";
import { sweepSpans } from "@packages/drizzle/sweep-span";
import { afterTimeIdCursor } from "@packages/http/time-id-cursor";
import * as staffSchema from "../../../schemas/staff";
import type { ListApprovalsInput } from "../../application/dto/list-approvals.dto";
import {
  APPROVAL_STATUSES,
  type ApprovalClaim,
  type ApprovalCreation,
  type ApprovalFailure,
  type ApprovalRecord,
  type ApprovalStatus,
  type ApprovalStoreError,
  type ApprovalWrite,
  type IApprovalStore,
  type OpenApprovals,
} from "../../application/ports/approval-store.port";

type Executor = ReturnType<typeof resolveExecutor>;

const dbAttrs = { "db.system.name": "postgresql" } as const;
const { adminApproval: table } = staffSchema;
const NEXT_VERSION = sql`${table.version} + 1`;

function isStatus(value: string): value is ApprovalStatus {
  return APPROVAL_STATUSES.some((status) => status === value);
}

function recordOf(row: typeof table.$inferSelect): Option<ApprovalRecord> {
  const { action, status } = row;
  if (!isApprovalAction(action) || !isStatus(status)) return Option.none();

  return Option.some({
    id: row.id,
    action,
    subjectId: row.subjectId,
    params: row.params,
    requestedBy: row.requestedBy,
    status,
    decidedBy: Option.fromNullable(row.decidedBy),
    decisionNote: Option.fromNullable(row.decisionNote),
    failureReason: Option.fromNullable(row.failureReason),
    expiresAt: row.expiresAt,
    decidedAt: Option.fromNullable(row.decidedAt),
    createdAt: row.createdAt,
    version: row.version,
  });
}

function recordsOf(rows: (typeof table.$inferSelect)[]): ApprovalRecord[] {
  return rows.flatMap((row) => {
    const record = recordOf(row);

    return record.isSome() ? [record.unwrap()] : [];
  });
}

function firstOf(rows: (typeof table.$inferSelect)[]): Option<ApprovalRecord> {
  return Option.fromNullable(rows[0]).flatMap(recordOf);
}

const pendingAndLive = and(eq(table.status, "pending"), gt(table.expiresAt, dbNow));
const pendingAndDue = requireFilter(
  and(eq(table.status, "pending"), lt(table.expiresAt, dbNow)),
  "sweep-admin-approvals",
);
const CREATE_ATTEMPTS = 3;
const EXPIRED = { status: "expired", decidedAt: dbNow, version: NEXT_VERSION };

export class DrizzleApprovalStore implements IApprovalStore {
  private readonly fail;

  constructor(
    private readonly instrumentation: IInstrumentation,
    private readonly uow: IUnitOfWork,
    logger: ILogger,
  ) {
    this.fail = createDbFailure("ADMIN_APPROVAL_PROVIDER_FAILURE", logger);
  }

  create(input: ApprovalWrite): Promise<Result<ApprovalCreation, ApprovalStoreError>> {
    return this.traced("create", "approval create failed", async (exec) => {
      for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
        const inserted = firstOf(
          await this.query(
            exec
              .insert(table)
              .values({
                id: crypto.randomUUID(),
                action: input.action,
                subjectId: input.subjectId,
                params: input.params,
                requestedBy: input.requestedBy,
                expiresAt: secondsFromNow(input.ttlHours * 3600),
              })
              .onConflictDoNothing({
                target: [table.action, table.subjectId],
                where: eq(table.status, "pending"),
              })
              .returning(),
          ),
        );
        if (inserted.isSome()) return { record: inserted.unwrap(), created: true };

        const open = firstOf(
          await this.query(
            exec
              .select()
              .from(table)
              .where(
                and(
                  eq(table.action, input.action),
                  eq(table.subjectId, input.subjectId),
                  eq(table.status, "pending"),
                ),
              )
              .limit(1),
          ),
        );
        if (open.isSome()) return { record: open.unwrap(), created: false };
      }

      throw new Error("the open request kept settling while a new one was being stored");
    });
  }

  find(id: string): Promise<Result<Option<ApprovalRecord>, ApprovalStoreError>> {
    return this.traced("find", "approval lookup failed", async (exec) => {
      const rows = await this.query(exec.select().from(table).where(eq(table.id, id)).limit(1));

      return firstOf(rows);
    });
  }

  list(input: ListApprovalsInput): Promise<Result<ApprovalRecord[], ApprovalStoreError>> {
    return this.traced("list", "approval list failed", async (exec) => {
      const rows = await this.query(
        exec
          .select()
          .from(table)
          .where(
            and(
              input.status ? eq(table.status, input.status) : undefined,
              input.cursor ? afterTimeIdCursor(table.createdAt, table.id, input.cursor) : undefined,
            ),
          )
          .orderBy(desc(table.createdAt), desc(table.id))
          .limit(input.limit),
      );

      return recordsOf(rows);
    });
  }

  listOpen(limit: number): Promise<Result<OpenApprovals, ApprovalStoreError>> {
    return this.traced("listOpen", "open approvals read failed", async (exec) => {
      const rows = await exec
        .select()
        .from(table)
        .where(pendingAndLive)
        .orderBy(asc(table.createdAt), asc(table.id))
        .limit(limit);
      const [total] = await exec.select({ value: count() }).from(table).where(pendingAndLive);

      return { items: recordsOf(rows), total: total?.value ?? 0 };
    });
  }

  claim(input: ApprovalClaim): Promise<Result<Option<ApprovalRecord>, ApprovalStoreError>> {
    return this.traced("claim", "approval claim failed", async (exec) => {
      const rows = await this.query(
        exec
          .update(table)
          .set({
            status: input.status,
            decidedBy: input.decidedBy,
            decisionNote: input.note,
            decidedAt: dbNow,
            version: NEXT_VERSION,
          })
          .where(and(eq(table.id, input.id), pendingAndLive))
          .returning(),
      );

      return firstOf(rows);
    });
  }

  cancel(
    id: string,
    requestedBy: string,
  ): Promise<Result<Option<ApprovalRecord>, ApprovalStoreError>> {
    return this.traced("cancel", "approval cancel failed", async (exec) => {
      const rows = await this.query(
        exec
          .update(table)
          .set({ status: "cancelled", decidedAt: dbNow, version: NEXT_VERSION })
          .where(and(eq(table.id, id), eq(table.requestedBy, requestedBy), pendingAndLive))
          .returning(),
      );

      return firstOf(rows);
    });
  }

  markExecuted(id: string, version: number): Promise<Result<boolean, ApprovalStoreError>> {
    return this.traced("markExecuted", "approval execution mark failed", async (exec) => {
      const rows = await this.query(
        exec
          .update(table)
          .set({ status: "executed", version: NEXT_VERSION })
          .where(and(eq(table.id, id), eq(table.status, "approved"), eq(table.version, version)))
          .returning({ id: table.id }),
      );

      return rows.length > 0;
    });
  }

  markFailed(input: ApprovalFailure): Promise<Result<boolean, ApprovalStoreError>> {
    return this.traced("markFailed", "approval failure mark failed", async (exec) => {
      const rows = await this.query(
        exec
          .update(table)
          .set({
            status: "failed",
            decidedBy: input.decidedBy,
            decisionNote: input.note,
            failureReason: input.reason,
            decidedAt: dbNow,
            version: NEXT_VERSION,
          })
          .where(and(eq(table.id, input.id), eq(table.status, "pending")))
          .returning({ id: table.id }),
      );

      return rows.length > 0;
    });
  }

  expireDue(limit: number): Promise<Result<ApprovalRecord[], ApprovalStoreError>> {
    return this.traced("expireDue", "approval expiry failed", () =>
      withSweepGuards(this.uow, async (exec) => {
        const batch = lockedBatch(exec, {
          table,
          idColumn: table.id,
          where: pendingAndDue,
          orderBy: table.expiresAt,
          batchSize: limit,
        });
        const rows = await this.query(
          exec.update(table).set(EXPIRED).where(inArray(table.id, batch)).returning(),
        );

        return recordsOf(rows);
      }),
    );
  }

  expireDueFor(
    action: ApprovalAction,
    subjectId: string,
  ): Promise<Result<ApprovalRecord[], ApprovalStoreError>> {
    return this.traced("expireDueFor", "approval expiry failed", async (exec) => {
      const rows = await this.query(
        exec
          .update(table)
          .set(EXPIRED)
          .where(and(eq(table.action, action), eq(table.subjectId, subjectId), pendingAndDue))
          .returning(),
      );

      return recordsOf(rows);
    });
  }

  countDue(): Promise<Result<number, ApprovalStoreError>> {
    return this.traced("countDue", "approval count failed", () =>
      countEligibleWithTimeout(table, pendingAndDue, sweepSpans(this.instrumentation), this.uow),
    );
  }

  closeForDeletedUser(userId: string): Promise<Result<ApprovalRecord[], ApprovalStoreError>> {
    return this.traced("closeForDeletedUser", "approval closure failed", async (exec) => {
      const rows = await exec
        .update(table)
        .set({ status: "cancelled", decidedAt: dbNow, version: NEXT_VERSION })
        .where(
          and(
            eq(table.status, "pending"),
            or(eq(table.subjectId, userId), eq(table.requestedBy, userId)),
          ),
        )
        .returning();
      await exec
        .update(table)
        .set({ params: {}, decisionNote: null })
        .where(eq(table.subjectId, userId));

      return recordsOf(rows);
    });
  }

  private traced<T>(
    method: string,
    message: string,
    work: (exec: Executor) => Promise<T>,
  ): Promise<Result<T, ApprovalStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: `DrizzleApprovalStore > ${method}` },
      async () => {
        try {
          return Result.ok(await work(exec));
        } catch (err) {
          this.instrumentation.capture(err);
          return this.fail(err, message);
        }
      },
    );
  }

  private query<T>(builder: { toSQL(): { sql: string }; execute(): Promise<T> }): Promise<T> {
    return this.instrumentation.startSpan(
      { name: builder.toSQL().sql, op: "db.query", attributes: dbAttrs },
      () => builder.execute(),
    );
  }
}
