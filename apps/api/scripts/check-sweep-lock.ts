// WARNING: this script acquires leases under the real production route labels
// (`sweep-audit-log`, `sweep-outbox`, …) for up to 60s each. Point it only at a local
// database — running it against a shared or production database will contend with,
// and can starve, the real sweeps for that duration.
//
// A mocked `tx` never evaluates a real `WHERE` or `SET ... WHERE` — the whole point of
// `acquireSweepLease` is the conditional UPDATE the database performs, so this checks it
// against a real Postgres instead. Wired to a script, not `bun:test`: nearly every test
// file in this suite calls `mock.module("@packages/drizzle", ...)`, bun runs the whole
// suite in one process, and that replacement is process-wide and permanent — sharing a
// process with those files would silently swap `db`/`eq`/`sql` for stand-ins that never
// touch Postgres. See apps/api/src/shared/CLAUDE.md ("write an executable check against a
// real database and wire it to a script") and `check-fanout-preferences.ts` for the
// reference shape. Run: `pnpm --filter api check:sweep-lock` — re-run after any change to
// sweep-lock.ts (see docs/FEATURES.md and docs/REMOVABILITY.md).

import { Writable } from "node:stream";
import { db, eq, sql, sweepSchema } from "@packages/drizzle";
import { Hono } from "hono";
import { pinoLogger } from "hono-pino";
import { pino } from "pino";
import { env } from "../src/shared/env";
import { canonicalize, sign } from "../src/shared/internal-routes/internal-signature";
import { sweepAuditLogRoutes } from "../src/shared/internal-routes/sweep-audit-log.route";
import { sweepConsentsRoutes } from "../src/shared/internal-routes/sweep-consents.route";
import { sweepEmailMessagesRoutes } from "../src/shared/internal-routes/sweep-email-messages.route";
import {
  acquireSweepLease,
  releaseSweepLease,
  sweepLockFor,
} from "../src/shared/internal-routes/sweep-lock";
import { sweepNotificationsRoutes } from "../src/shared/internal-routes/sweep-notifications.route";
import { sweepOutboxRoutes } from "../src/shared/internal-routes/sweep-outbox.route";
import { purgeBatchWithTimeout } from "../src/shared/internal-routes/sweep-purge";
import { sweepSpans } from "../src/shared/internal-routes/sweep-span";
import { sweepWebhookDeliveryRoutes } from "../src/shared/internal-routes/sweep-webhook-delivery.route";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";
import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-sweep-lock");

let failed = false;

// A fresh façade per check, not one shared across the whole script — mirrors how
// production builds one `SweepSpans` per request instead of a module-level singleton.
const freshSpans = () => sweepSpans(new NoOpInstrumentation());

function check(label: string, ok: boolean) {
  console.log(`${ok ? "  OK" : "  FAIL"}: ${label}`);
  if (!ok) failed = true;
}

// ── acquireSweepLease / releaseSweepLease, fenced by ownership token ────────────────
const label = `check-sweep-${crypto.randomUUID()}`;

// [1] first caller wins, second is refused while the lease is live.
const owner1 = await acquireSweepLease(label, 60_000, freshSpans());
check("first caller acquires the lease", owner1 !== null);
check("second caller is refused", (await acquireSweepLease(label, 60_000, freshSpans())) === null);
if (owner1) await releaseSweepLease(label, owner1, freshSpans());
const owner2 = await acquireSweepLease(label, 60_000, freshSpans());
check("caller re-acquires after release", owner2 !== null);
if (owner2) await releaseSweepLease(label, owner2, freshSpans());

// [2] a lease left behind by a crashed run (already expired) is reclaimable.
const expiredOwner = await acquireSweepLease(label, -60_000, freshSpans());
check("expired lease is written", expiredOwner !== null);
const reclaimOwner = await acquireSweepLease(label, 60_000, freshSpans());
check("next caller reclaims the expired lease", reclaimOwner !== null);
if (reclaimOwner) await releaseSweepLease(label, reclaimOwner, freshSpans());

// [3] release deletes the row rather than leaving a freed-but-present lease.
const owner3 = await acquireSweepLease(label, 60_000, freshSpans());
if (owner3) await releaseSweepLease(label, owner3, freshSpans());
const rowsAfterRelease = await db
  .select()
  .from(sweepSchema.sweepLock)
  .where(eq(sweepSchema.sweepLock.label, label));
check("release deletes the row", rowsAfterRelease.length === 0);

// [4] a stale owner's release does not steal a successor's lease — the bug this
// ownership token exists to close: an overrunning run must not delete the row a
// legitimate successor now holds just because it shares the same label.
const staleOwner = await acquireSweepLease(label, -60_000, freshSpans());
const successorOwner = await acquireSweepLease(label, 60_000, freshSpans());
if (staleOwner) await releaseSweepLease(label, staleOwner, freshSpans());
const rowsAfterStaleRelease = await db
  .select()
  .from(sweepSchema.sweepLock)
  .where(eq(sweepSchema.sweepLock.label, label));
check(
  "a stale owner's release does not delete the successor's row",
  rowsAfterStaleRelease.length === 1 && rowsAfterStaleRelease[0]?.owner === successorOwner,
);
if (successorOwner) await releaseSweepLease(label, successorOwner, freshSpans());

// ── sweepLockFor: label + TTL it produces ────────────────────────────────────────
const wiringLabel = `check-sweep-wiring-${crypto.randomUUID()}`;
const wiringLock = sweepLockFor(wiringLabel, freshSpans());
check("sweepLockFor's acquire succeeds", await wiringLock.acquire());
const wiringRows = await db
  .select()
  .from(sweepSchema.sweepLock)
  .where(eq(sweepSchema.sweepLock.label, wiringLabel));
const wiringRow = wiringRows[0];
const ttlMs = wiringRow
  ? wiringRow.lockedUntil.getTime() - wiringRow.lockedAt.getTime()
  : Number.NaN;
check("sweepLockFor writes the label it was given", wiringRows.length === 1);
check(
  `sweepLockFor's TTL is env.SWEEP_DEADLINE_MS * 2 (got ${ttlMs}ms)`,
  Math.abs(ttlMs - env.SWEEP_DEADLINE_MS * 2) < 2_000,
);
await wiringLock.release();
const wiringRowsAfterRelease = await db
  .select()
  .from(sweepSchema.sweepLock)
  .where(eq(sweepSchema.sweepLock.label, wiringLabel));
check("sweepLockFor's release deletes the row", wiringRowsAfterRelease.length === 0);

// ── purgeBatchWithTimeout: the three SET LOCAL guards, checked against a real
// transaction. A mocked `tx.execute` can only assert on the SQL text a builder
// produced (banned — see apps/api/src/shared/CLAUDE.md), and that check is weak on
// its own terms: it only proves the setting *names* were sent, not their values, so
// '5s' silently becoming '5m' would still pass. `assertGuards` runs inside the same
// transaction `purgeBatchWithTimeout` opens, right after the three `SET LOCAL`
// statements, and reads `current_setting(...)` back from Postgres itself. ──────────
{
  let guardsOk = false;
  let observed: { statementTimeout?: string; lockTimeout?: string; idleTimeout?: string } = {};
  await purgeBatchWithTimeout({
    table: sweepSchema.sweepLock,
    idColumn: sweepSchema.sweepLock.label,
    // Matches no row — a real lease label never collides with this sentinel — so the
    // guard check runs (and the delete executes as a harmless no-op) without touching
    // any lease another check or a real sweep might be holding.
    where: eq(sweepSchema.sweepLock.label, `check-sweep-guard-${crypto.randomUUID()}`),
    orderBy: sweepSchema.sweepLock.lockedAt,
    batchSize: 1,
    spans: freshSpans(),
    assertGuards: async (tx) => {
      const result = await tx.execute(sql`
        SELECT
          current_setting('statement_timeout') AS statement_timeout,
          current_setting('lock_timeout') AS lock_timeout,
          current_setting('idle_in_transaction_session_timeout') AS idle_timeout
      `);
      const row = result.rows[0] as
        | { statement_timeout: string; lock_timeout: string; idle_timeout: string }
        | undefined;
      observed = {
        statementTimeout: row?.statement_timeout,
        lockTimeout: row?.lock_timeout,
        idleTimeout: row?.idle_timeout,
      };
      guardsOk =
        row?.statement_timeout === "5s" &&
        row?.lock_timeout === "500ms" &&
        row?.idle_timeout === "10s";
    },
  });
  check(
    `purgeBatchWithTimeout's SET LOCAL guards are exactly 5s/500ms/10s (got ${JSON.stringify(observed)})`,
    guardsOk,
  );
}

// ── the six routes: each must pass its own label to sweepLockFor, not a shared or
// wrong one — proven by holding that exact label's lease and expecting THIS route,
// and only this route, to log the skip for it. Deleting a route's `lock:` wiring, or
// wiring it to the wrong label, makes this fail. Asserted off the log line rather than
// the response body: sweep-audit-log's handler reshapes its response but still spreads
// the full `result` (so `skipped` does survive there), and this way every route is
// checked the same way rather than special-casing the one with an extra field. The
// log line (`${label} skipped — another run holds the lease`, always emitted by
// runRetentionSweep itself) is the one signal every route shares. ────────
function makeApp(routes: Hono, lines: string[]) {
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  const testLogger = pino(sink);
  const app = new Hono();
  app.use("*", pinoLogger({ pino: testLogger }));
  app.route("/internal", routes);
  return app;
}

async function signedRequest(app: Hono, path: string, body: unknown) {
  const key = env.INTERNAL_SIGNING_KEY;
  if (!key) throw new Error("INTERNAL_SIGNING_KEY is not set — cannot sign a request");
  const rawBody = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000);
  const message = canonicalize({
    timestamp,
    method: "POST",
    path,
    host: "localhost",
    contentType: "application/json",
    rawBody,
  });
  const signature = await sign(message, key);
  return app.request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host: "localhost",
      "X-Internal-Signature": `t=${timestamp},v1=${signature}`,
    },
    body: rawBody,
  });
}

const routeCases: Array<{ name: string; path: string; routes: Hono }> = [
  {
    name: "sweep-email-messages",
    path: "/internal/sweep-email-messages",
    routes: sweepEmailMessagesRoutes as unknown as Hono,
  },
  {
    name: "sweep-audit-log",
    path: "/internal/sweep-audit-log",
    routes: sweepAuditLogRoutes as unknown as Hono,
  },
  {
    name: "sweep-outbox",
    path: "/internal/sweep-outbox",
    routes: sweepOutboxRoutes as unknown as Hono,
  },
  {
    name: "sweep-consents",
    path: "/internal/sweep-consents",
    routes: sweepConsentsRoutes as unknown as Hono,
  },
  {
    name: "sweep-webhook-delivery",
    path: "/internal/sweep-webhook-delivery",
    routes: sweepWebhookDeliveryRoutes as unknown as Hono,
  },
  {
    name: "sweep-notifications",
    path: "/internal/sweep-notifications",
    routes: sweepNotificationsRoutes as unknown as Hono,
  },
];

for (const { name, path, routes } of routeCases) {
  const routeOwner = await acquireSweepLease(name, 60_000, freshSpans());
  const lines: string[] = [];
  const res = await signedRequest(makeApp(routes, lines), path, { dryRun: true });
  check(`${name} responds 200 while its lease is held`, res.status === 200);
  const captured = lines.join("");
  const skipLine = captured.includes(`${name} skipped — another run holds the lease`);
  check(`${name} logs the skip for its own label ("${name}")`, skipLine);
  if (routeOwner) await releaseSweepLease(name, routeOwner, freshSpans());
}

if (failed) {
  console.error("check:sweep-lock FAILED");
  process.exit(1);
}
console.log("check:sweep-lock OK");
