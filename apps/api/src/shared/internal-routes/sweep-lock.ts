import { uuidv7 } from "@packages/ddd-kit";
import { and, db, eq, sql, sweepSchema } from "@packages/drizzle";
import { env } from "../env";
import type { ITransaction } from "../transaction";
import type { SweepLock } from "./sweep-runner";

/**
 * Takes the lease for `label`, or reports that someone else holds it.
 *
 * One statement, so two processes racing on the same label cannot both win: the
 * conflicting UPDATE only fires when the existing lease has expired, and a row
 * comes back only when this caller is the holder.
 *
 * Returns the caller's ownership token (or `null` when it lost), not just a
 * boolean: the deadline is only checked between batches, so a run can outlive its
 * own TTL. If it does, its lease expires, a successor legitimately acquires it,
 * and the overrunning run must not then delete that successor's row just because
 * it still holds the same `label` — `releaseSweepLease` deletes by `label` AND
 * `owner`, so a stale caller's release is a no-op instead of stealing the lease.
 *
 * `exec` defaults to the shared `db` client (same `tx ?? db` swap-point used by
 * every repository) — a caller inside an existing transaction can pass its `tx`
 * instead of opening a second connection.
 */
export async function acquireSweepLease(
  label: string,
  ttlMs: number,
  exec?: ITransaction,
): Promise<string | null> {
  const lock = sweepSchema.sweepLock;
  const client = exec ?? db;
  const owner = uuidv7();
  const until = new Date(Date.now() + ttlMs);
  const rows = await client
    .insert(lock)
    .values({ label, owner, lockedAt: new Date(), lockedUntil: until })
    .onConflictDoUpdate({
      target: lock.label,
      set: { owner, lockedAt: new Date(), lockedUntil: until },
      setWhere: sql`${lock.lockedUntil} < now()`,
    })
    .returning({ label: lock.label });
  return rows.length > 0 ? owner : null;
}

export async function releaseSweepLease(
  label: string,
  owner: string,
  exec?: ITransaction,
): Promise<void> {
  const lock = sweepSchema.sweepLock;
  const client = exec ?? db;
  await client.delete(lock).where(and(eq(lock.label, label), eq(lock.owner, owner)));
}

/**
 * Builds the `{ acquire, release }` pair a sweep route passes to `runRetentionSweep`,
 * closing over the label and its ownership token so the runner's `SweepLock` shape
 * stays a plain boolean-returning `acquire`/no-arg `release` — the token never
 * leaves this module. TTL is the sweep budget plus a margin (`SWEEP_DEADLINE_MS * 2`),
 * so a crashed run frees the label shortly after it would have finished anyway — every
 * route shares this one place instead of repeating the literal.
 */
export function sweepLockFor(label: string): SweepLock {
  let owner: string | null = null;
  return {
    acquire: async () => {
      owner = await acquireSweepLease(label, env.SWEEP_DEADLINE_MS * 2);
      return owner !== null;
    },
    release: async () => {
      if (owner === null) return;
      await releaseSweepLease(label, owner);
      owner = null;
    },
  };
}
