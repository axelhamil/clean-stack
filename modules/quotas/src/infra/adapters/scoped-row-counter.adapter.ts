import { type IInstrumentation, Result } from "@packages/ddd-kit";
import type { AnyPgColumn, AnyPgTable } from "@packages/drizzle";
import { count, eq, resolveExecutor } from "@packages/drizzle";
import type {
  IQuotaCounter,
  QuotaCountError,
} from "../../application/ports/services/quota-counter.port";

export interface ScopedTable {
  table: AnyPgTable;
  organizationColumn: AnyPgColumn;
}

export type QuotaTables = Readonly<Record<string, ScopedTable>>;

const dbAttrs = { "db.system.name": "postgresql" } as const;

export class ScopedRowCounter implements IQuotaCounter {
  constructor(
    private readonly tables: QuotaTables,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async count(organizationId: string, resource: string): Promise<Result<number, QuotaCountError>> {
    const scoped = this.tables[resource];
    if (scoped === undefined) {
      return Result.fail({
        code: "QUOTA_RESOURCE_NOT_FOUND",
        message: `No table counts the quota ${resource}.`,
      });
    }

    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "ScopedRowCounter > count" }, async () => {
      try {
        const query = exec
          .select({ n: count() })
          .from(scoped.table)
          .where(eq(scoped.organizationColumn, organizationId));
        const rows = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(rows[0]?.n ?? 0);
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail({
          code: "QUOTA_PROVIDER_FAILURE",
          message: `The usage of ${resource} could not be counted.`,
        });
      }
    });
  }
}
