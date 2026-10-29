import { UnitOfWorkContext } from "@packages/ddd-kit";
import type { AnyPgColumn, AnyPgTable } from "@packages/drizzle";
import { count, eq, resolveExecutor, sql } from "@packages/drizzle";
import type { QuotaKey } from "../entitlements";
import { assertQuota } from "../middleware/billing.middleware";

export async function countScopedRows(
  table: AnyPgTable,
  orgColumn: AnyPgColumn,
  orgId: string,
): Promise<number> {
  const rows = await resolveExecutor()
    .select({ n: count() })
    .from(table)
    .where(eq(orgColumn, orgId));
  return rows[0]?.n ?? 0;
}

export async function reserveQuota(
  orgId: string,
  key: QuotaKey,
  limit: number | null,
  countFn: () => Promise<number>,
): Promise<void> {
  if (limit === null) return;
  if (!UnitOfWorkContext.transaction()) {
    throw new Error(
      "reserveQuota must run inside uow.run: its lock lives as long as the transaction",
    );
  }

  await resolveExecutor().execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${orgId}:${key}`}, 0))`,
  );
  const used = await countFn();
  assertQuota(used, limit);
}
