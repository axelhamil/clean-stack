import type { IUnitOfWork } from "@packages/ddd-kit";
import type { AnyPgTable, SQL } from "@packages/drizzle";
import { count, resolveExecutor, sql } from "@packages/drizzle";
import type { SweepSpans } from "./sweep-span";

/**
 * Shared `countEligible` body for every sweep route. Mirrors the guard `purgeBatch`
 * already carries: a dry-run count on a large table is otherwise unbounded, and it
 * holds a pooled connection for the whole idle timeout, this became a much longer
 * worst case once the outer socket timeout was raised to accommodate the sweep budget.
 */
export async function countEligibleWithTimeout(
  table: AnyPgTable,
  where: SQL | undefined,
  spans: SweepSpans,
  uow: IUnitOfWork,
): Promise<number> {
  return uow.run(async () => {
    const exec = resolveExecutor();
    await exec.execute(sql`SET LOCAL statement_timeout = '10s'`);
    const query = exec.select({ count: count() }).from(table).where(where);
    const rows = await spans.db(
      () => query.toSQL().sql,
      () => query.execute(),
    );
    return rows[0]?.count ?? 0;
  });
}
