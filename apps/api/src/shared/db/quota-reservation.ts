import type { AnyPgColumn, AnyPgTable } from "@packages/drizzle";
import { count, eq, sql } from "@packages/drizzle";
import type { QuotaKey } from "../../modules/billing/config";
import { assertQuota } from "../middleware/billing.middleware";
import type { ITransaction } from "../transaction";

export async function countScopedRows(
  tx: ITransaction,
  table: AnyPgTable,
  orgColumn: AnyPgColumn,
  orgId: string,
): Promise<number> {
  const rows = await tx.select({ n: count() }).from(table).where(eq(orgColumn, orgId));
  return rows[0]?.n ?? 0;
}

export async function reserveQuota(
  tx: ITransaction,
  orgId: string,
  key: QuotaKey,
  limit: number | null,
  countFn: (tx: ITransaction) => Promise<number>,
): Promise<void> {
  if (limit === null) return;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${orgId}:${key}`}, 0))`);
  const used = await countFn(tx);
  assertQuota(used, limit);
}
