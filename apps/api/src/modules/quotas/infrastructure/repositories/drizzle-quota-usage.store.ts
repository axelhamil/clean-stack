import { Result, uuidv7 } from "@packages/ddd-kit";
import { and, db, eq, quotaUsageSchema, sql } from "@packages/drizzle";
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";
import type { ITransaction } from "../../../../shared/transaction";
import type {
  IQuotaUsageStore,
  QuotaError,
  QuotaPeriod,
} from "../../application/ports/quota-usage.port";

const qu = quotaUsageSchema.quotaUsage;
const dbAttrs = { "db.system.name": "postgresql" } as const;

function failure(err: unknown, op: string): QuotaError {
  return { code: "QUOTA_PROVIDER_FAILURE", message: `quota_usage ${op} failed: ${String(err)}` };
}

function usageRowOf(orgId: string, resource: string, period: QuotaPeriod) {
  return and(
    eq(qu.organizationId, orgId),
    eq(qu.resource, resource),
    eq(qu.periodStart, period.start),
  );
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
    const exec = tx ?? db;

    return this.instrumentation.startSpan(
      { name: "DrizzleQuotaUsageStore > increment" },
      async () => {
        try {
          const query = exec
            .insert(qu)
            .values({
              id: uuidv7(),
              organizationId: orgId,
              resource,
              used: by,
              periodStart: period.start,
              periodEnd: period.end,
            })
            .onConflictDoUpdate({
              target: [qu.organizationId, qu.resource, qu.periodStart],
              set: { used: sql`${qu.used} + ${by}`, updatedAt: new Date() },
            })
            .returning({ used: qu.used });

          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(row?.used ?? 0);
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
    const exec = tx ?? db;

    return this.instrumentation.startSpan(
      { name: "DrizzleQuotaUsageStore > current" },
      async () => {
        try {
          const query = exec
            .select({ used: qu.used })
            .from(qu)
            .where(usageRowOf(orgId, resource, period));

          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(row?.used ?? 0);
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
    const exec = tx ?? db;

    return this.instrumentation.startSpan({ name: "DrizzleQuotaUsageStore > reset" }, async () => {
      try {
        const query = exec
          .update(qu)
          .set({ used: 0, updatedAt: new Date() })
          .where(usageRowOf(orgId, resource, period));

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
