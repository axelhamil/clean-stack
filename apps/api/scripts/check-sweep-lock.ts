// A mocked `tx` never evaluates a real `WHERE` or `SET ... WHERE` — the whole point of
// `acquireSweepLease` is the conditional UPDATE the database performs, so this checks it
// against a real Postgres instead. Wired to a script, not `bun:test`: nearly every test
// file in this suite calls `mock.module("@packages/drizzle", ...)`, bun runs the whole
// suite in one process, and that replacement is process-wide and permanent — sharing a
// process with those files would silently swap `db`/`eq`/`sql` for stand-ins that never
// touch Postgres. See apps/api/src/shared/CLAUDE.md ("write an executable check against a
// real database and wire it to a script") and `check-fanout-preferences.ts` for the
// reference shape. Run: `pnpm --filter api check:sweep-lock`.

import { db, eq, sweepSchema } from "@packages/drizzle";
import { acquireSweepLease, releaseSweepLease } from "../src/shared/internal-routes/sweep-lock";

let failed = false;

function check(label: string, ok: boolean) {
  console.log(`${ok ? "  OK" : "  ECHEC"}: ${label}`);
  if (!ok) failed = true;
}

const label = `check-sweep-${crypto.randomUUID()}`;

// [1] first caller wins, second is refused while the lease is live.
check("first caller acquires the lease", (await acquireSweepLease(label, 60_000)) === true);
check("second caller is refused", (await acquireSweepLease(label, 60_000)) === false);
await releaseSweepLease(label);
check("caller re-acquires after release", (await acquireSweepLease(label, 60_000)) === true);
await releaseSweepLease(label);

// [2] a lease left behind by a crashed run (already expired) is reclaimable.
check("expired lease is written", (await acquireSweepLease(label, -1_000)) === true);
check("next caller reclaims the expired lease", (await acquireSweepLease(label, 60_000)) === true);
await releaseSweepLease(label);

// [3] release deletes the row rather than leaving a freed-but-present lease.
await acquireSweepLease(label, 60_000);
await releaseSweepLease(label);
const rows = await db
  .select()
  .from(sweepSchema.sweepLock)
  .where(eq(sweepSchema.sweepLock.label, label));
check("release deletes the row", rows.length === 0);

if (failed) {
  console.error("check:sweep-lock FAILED");
  process.exit(1);
}
console.log("check:sweep-lock OK");
