import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import {
  count,
  dbOperationFailure,
  desc,
  emailSchema,
  eq,
  outboxSchema,
  resolveExecutor,
} from "@packages/drizzle";
import type {
  DeadOutboxPage,
  DeadQueueCounts,
  IOpsStore,
  OpsStoreError,
} from "../../../application/ports/repositories/ops-store.port";
import type { IDeadWebhookReader } from "../../../application/ports/services/dead-webhook-reader.port";

const oe = outboxSchema.outboxEvent;
const { emailMessage } = emailSchema;
const failure = dbOperationFailure("ADMIN_OPS_PROVIDER_FAILURE");
const dbAttrs = { "db.system.name": "postgresql" } as const;
const { deadRow } = outboxSchema;

export class DrizzleOpsRepository implements IOpsStore {
  constructor(
    private readonly instrumentation: IInstrumentation,
    private readonly deadWebhooks: IDeadWebhookReader,
  ) {}

  async listDeadOutbox(limit: number): Promise<Result<DeadOutboxPage, OpsStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleOpsRepository > listDeadOutbox" },
      async () => {
        try {
          const rows = await exec
            .select({
              id: oe.id,
              eventType: oe.eventType,
              deadAt: oe.deadAt,
              attempts: oe.attempts,
              lastError: oe.lastError,
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

  async countDeadOutbox(): Promise<Result<number, OpsStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleOpsRepository > countDeadOutbox" },
      async () => {
        try {
          const query = exec.select({ value: count() }).from(oe).where(deadRow);
          const [total] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(total?.value ?? 0);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(failure("count dead outbox events"));
        }
      },
    );
  }

  async countDeadQueues(): Promise<Result<DeadQueueCounts, OpsStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleOpsRepository > countDeadQueues" },
      async () => {
        try {
          const [emails] = await exec
            .select({ value: count() })
            .from(emailMessage)
            .where(eq(emailMessage.status, "dead"));
          const webhooks = await this.deadWebhooks.countDeadLetters();
          if (webhooks.isFailure) return Result.fail(failure("count dead queues"));

          return Result.ok({ emails: emails?.value ?? 0, webhooks: webhooks.getValue() });
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(failure("count dead queues"));
        }
      },
    );
  }
}
