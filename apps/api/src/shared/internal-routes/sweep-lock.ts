import { db, eq, sql, sweepSchema } from "@packages/drizzle";
import type { ITransaction } from "../transaction";

const lock = sweepSchema.sweepLock;

/**
 * Takes the lease for `label`, or reports that someone else holds it.
 *
 * One statement, so two processes racing on the same label cannot both win: the
 * conflicting UPDATE only fires when the existing lease has expired, and a row
 * comes back only when this caller is the holder.
 *
 * `exec` defaults to the shared `db` client (same `tx ?? db` swap-point used by
 * every repository) — a caller inside an existing transaction can pass its `tx`
 * instead of opening a second connection.
 */
export async function acquireSweepLease(
  label: string,
  ttlMs: number,
  exec?: ITransaction,
): Promise<boolean> {
  const client = exec ?? db;
  const until = new Date(Date.now() + ttlMs);
  const rows = await client
    .insert(lock)
    .values({ label, lockedAt: new Date(), lockedUntil: until })
    .onConflictDoUpdate({
      target: lock.label,
      set: { lockedAt: new Date(), lockedUntil: until },
      setWhere: sql`${lock.lockedUntil} < now()`,
    })
    .returning({ label: lock.label });
  return rows.length > 0;
}

export async function releaseSweepLease(label: string, exec?: ITransaction): Promise<void> {
  const client = exec ?? db;
  await client.delete(lock).where(eq(lock.label, label));
}
