import { Option, Result } from "@packages/ddd-kit";
import {
  and,
  count,
  dbNow,
  desc,
  emailSchema,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  outboxSchema,
  resolveExecutor,
  secondsFromNow,
  webhooksSchema,
} from "@packages/drizzle";
import { dbOperationFailure } from "../../../../shared/db-failure";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type {
  DeadOutboxPage,
  DeadQueueCounts,
  IOpsStore,
  OpsStoreError,
} from "../../application/ports/ops-store.port";

const oe = outboxSchema.outboxEvent;
const { emailMessage } = emailSchema;
const { webhookDelivery } = webhooksSchema;
const failure = dbOperationFailure("ADMIN_OPS_PROVIDER_FAILURE");
const dbAttrs = { "db.system.name": "postgresql" } as const;
const deadRow = and(isNull(oe.dispatchedAt), isNotNull(oe.deadAt));

export class DrizzleOpsStore implements IOpsStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async listDeadOutbox(limit: number): Promise<Result<DeadOutboxPage, OpsStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleOpsStore > listDeadOutbox" },
      async () => {
        try {
          const rows = await exec
            .select({
              id: oe.id,
              eventType: oe.eventType,
              aggregateType: oe.aggregateType,
              aggregateId: oe.aggregateId,
              occurredAt: oe.occurredAt,
              deadAt: oe.deadAt,
              attempts: oe.attempts,
              lastError: oe.lastError,
              nextAttemptAt: oe.nextAttemptAt,
            })
            .from(oe)
            .where(deadRow)
            .orderBy(desc(oe.deadAt))
            .limit(limit);
          const [total] = await exec.select({ value: count() }).from(oe).where(deadRow);

          return Result.ok({
            items: rows.flatMap((row) =>
              row.deadAt
                ? [
                    {
                      ...row,
                      deadAt: row.deadAt,
                      lastError: Option.fromNullable(row.lastError),
                      nextAttemptAt: Option.fromNullable(row.nextAttemptAt),
                    },
                  ]
                : [],
            ),
            total: total?.value ?? 0,
          });
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(failure("list dead outbox events"));
        }
      },
    );
  }

  async countDeadQueues(): Promise<Result<DeadQueueCounts, OpsStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleOpsStore > countDeadQueues" },
      async () => {
        try {
          const [emails] = await exec
            .select({ value: count() })
            .from(emailMessage)
            .where(eq(emailMessage.status, "dead"));
          const [webhooks] = await exec
            .select({ value: count() })
            .from(webhookDelivery)
            .where(eq(webhookDelivery.status, "dead_letter"));

          return Result.ok({ emails: emails?.value ?? 0, webhooks: webhooks?.value ?? 0 });
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(failure("count dead queues"));
        }
      },
    );
  }

  async requeueDead(ids: string[], leaseSeconds: number): Promise<Result<string[], OpsStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleOpsStore > requeueDead" }, async () => {
      try {
        const query = exec
          .update(oe)
          .set({ nextAttemptAt: dbNow })
          .where(
            and(inArray(oe.id, ids), deadRow, gt(oe.nextAttemptAt, secondsFromNow(leaseSeconds))),
          )
          .returning({ id: oe.id });
        const rows = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(rows.map((row) => row.id));
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(failure("requeue dead outbox events"));
      }
    });
  }
}
