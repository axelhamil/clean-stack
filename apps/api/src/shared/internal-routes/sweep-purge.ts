import type { AnyPgColumn, AnyPgTable, SQL } from "@packages/drizzle";
import { db, inArray, sql } from "@packages/drizzle";
import type { SweepSpans } from "./sweep-span";

export type PurgeBatchOptions = {
  table: AnyPgTable;
  /** The primary key, selected by the locking subquery and matched by the delete. */
  idColumn: AnyPgColumn;
  where: SQL | undefined;
  /** Oldest-first column, so a truncated run resumes where it stopped. */
  orderBy: AnyPgColumn;
  batchSize: number;
  spans: SweepSpans;
};

/**
 * The one batched delete every retention sweep runs.
 *
 * Six routes carried byte-identical copies of this body; promoting it is what makes
 * "instrument the batches" a one-place change instead of six (rule #2). The three
 * `SET LOCAL` statements have no query-builder equivalent and stay raw (rule #5), and
 * they are the reason a batch cannot outlive the sweep budget between deadline checks.
 *
 * One span, not four: the transaction is multi-statement, and rule #8's trap (b) is
 * exactly this — N sibling inner spans are noise. The span wraps the delete and
 * carries its SQL; the lock-timeout guards and the FOR UPDATE subquery ride inside it.
 */
export async function purgeBatchWithTimeout(opts: PurgeBatchOptions): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
    await tx.execute(sql`SET LOCAL lock_timeout = '500ms'`);
    await tx.execute(sql`SET LOCAL idle_in_transaction_session_timeout = '10s'`);

    const subq = tx
      .select({ id: opts.idColumn })
      .from(opts.table)
      .where(opts.where)
      .orderBy(opts.orderBy)
      .limit(opts.batchSize)
      .for("update", { skipLocked: true });

    const query = tx
      .delete(opts.table)
      .where(inArray(opts.idColumn, subq))
      .returning({ id: opts.idColumn });

    const deleted = await opts.spans.db(query.toSQL().sql, () => query.execute());
    return deleted.length;
  });
}
