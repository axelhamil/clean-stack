import { Result, uuidv7 } from "@packages/ddd-kit";
import { and, db, eq, quotaUsageSchema, sql } from "@packages/drizzle";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { ITransaction } from "../../../../shared/transaction";
import type {
  IQuotaUsageStore,
  QuotaError,
  QuotaPeriod,
} from "../../application/ports/quota-usage.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

function failure(err: unknown, op: string): QuotaError {
  return { code: "QUOTA_PROVIDER_FAILURE", message: `quota_usage ${op} failed: ${String(err)}` };
}

export class DrizzleQuotaUsageStore implements IQuotaUsageStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async increment(
    orgId: string,
    resource: string,
    by: number,
    period: QuotaPeriod,
    tx?: ITransaction,
  ): Promise<Result<number, QuotaError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleQuotaUsageStore > increment" },
      async () => {
        try {
          const query = invoker
            .insert(quotaUsageSchema.quotaUsage)
            .values({
              id: uuidv7(),
              organizationId: orgId,
              resource,
              used: by,
              periodStart: period.start,
              periodEnd: period.end,
            })
            .onConflictDoUpdate({
              target: [
                quotaUsageSchema.quotaUsage.organizationId,
                quotaUsageSchema.quotaUsage.resource,
                quotaUsageSchema.quotaUsage.periodStart,
              ],
              set: {
                used: sql`${quotaUsageSchema.quotaUsage.used} + ${by}`,
                updatedAt: new Date(),
              },
            })
            .returning({ used: quotaUsageSchema.quotaUsage.used });
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(rows[0]?.used ?? by);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(failure(err, "increment"));
        }
      },
    );
  }

  async current(
    orgId: string,
    resource: string,
    period: QuotaPeriod,
    tx?: ITransaction,
  ): Promise<Result<number, QuotaError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleQuotaUsageStore > current" },
      async () => {
        try {
          const query = invoker
            .select({ used: quotaUsageSchema.quotaUsage.used })
            .from(quotaUsageSchema.quotaUsage)
            .where(
              and(
                eq(quotaUsageSchema.quotaUsage.organizationId, orgId),
                eq(quotaUsageSchema.quotaUsage.resource, resource),
                eq(quotaUsageSchema.quotaUsage.periodStart, period.start),
              ),
            );
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(rows[0]?.used ?? 0);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(failure(err, "current"));
        }
      },
    );
  }

  async reset(
    orgId: string,
    resource: string,
    period: QuotaPeriod,
    tx?: ITransaction,
  ): Promise<Result<void, QuotaError>> {
    const invoker = tx ?? db;
    return this.instrumentation.startSpan({ name: "DrizzleQuotaUsageStore > reset" }, async () => {
      try {
        const query = invoker
          .update(quotaUsageSchema.quotaUsage)
          .set({ used: 0, updatedAt: new Date() })
          .where(
            and(
              eq(quotaUsageSchema.quotaUsage.organizationId, orgId),
              eq(quotaUsageSchema.quotaUsage.resource, resource),
              eq(quotaUsageSchema.quotaUsage.periodStart, period.start),
            ),
          );
        await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );
        return Result.ok();
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(failure(err, "reset"));
      }
    });
  }
}
