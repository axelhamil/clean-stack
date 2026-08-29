/**
 * Proves against a real Postgres that a failed deletion-confirmation enqueue rolls back
 * the whole account-wipe transaction — the guarantee added by moving `sendTemplate` inside
 * `this.transactions.run(...)` in `RgpdService.executeAccountWipe`.
 *
 * A mocked unit-of-work (see `rgpd.service.test.ts`) can only prove the callback *throws*
 * instead of returning; only a real `db.transaction(...)` can prove Postgres actually
 * discards the wipe's writes when that throw happens. This script is that proof.
 *
 * Note: `DrizzleEmailQueue.enqueue` uses `onConflictDoNothing` on the idempotency-key unique
 * index (see `fix(email): suppress duplicate enqueues instead of failing the batch`), so a
 * pre-existing row with the same idempotency key is silently skipped rather than raising a
 * SQL error — it can no longer be used to force the enqueue to fail. Instead this script adds
 * a temporary CHECK constraint on `email_message.to_address` that rejects the probe user's
 * email, forcing a genuine Postgres-level failure at the exact insert the wipe transaction
 * performs, then drops the constraint again in cleanup.
 *
 * WARNING: `ALTER TABLE ... ADD CONSTRAINT` takes an ACCESS EXCLUSIVE lock on the shared
 * `email_message` table for the duration of the statement — stop the dev API worker (and any
 * other process reading/writing `email_message`) before running this script, or the lock wait
 * will queue behind it. This script also refuses to run against a non-local `DATABASE_URL` and
 * caps the lock wait with `lock_timeout` so a stuck lock fails fast instead of hanging.
 */

import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-wipe-rollback");

import { authSchema, db, eq, sql, TransactionService } from "@packages/drizzle";
import { RgpdService } from "../src/modules/rgpd/application/services/rgpd.service";
import { DrizzleRgpdRepository } from "../src/modules/rgpd/infrastructure/repositories/drizzle-rgpd.repository";
import { NoOpStorageService } from "../src/modules/uploads/infrastructure/services/noop-storage.service";
import { logger } from "../src/shared/logger";
import { DrizzleEmailQueue } from "../src/shared/services/drizzle-email-queue.service";
import { DrizzleOutboxRepository } from "../src/shared/services/drizzle-outbox.service";
import { QueuedEmailService } from "../src/shared/services/email.service";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";

const instrumentation = new NoOpInstrumentation();
const PROBE_MARKER = "wipe-rollback-probe";
const userId = `check-wipe-rollback-${crypto.randomUUID()}`;
const probeEmail = `${PROBE_MARKER}-${userId}@example.com`;
const CONSTRAINT_NAME = "check_wipe_rollback_probe";

let failures = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  OK: ${label}`);
  } else {
    failures += 1;
    console.log(`  ECHEC: ${label}`);
  }
}

async function seedUser(): Promise<void> {
  await db.insert(authSchema.user).values({
    id: userId,
    name: "Wipe Rollback Probe",
    email: probeEmail,
    emailVerified: true,
    pendingDeletionUntil: new Date(Date.now() - 1000),
    deletedAt: null,
    locale: "en",
  });
}

async function addFailingConstraint(): Promise<void> {
  // Bound so a lock held by another process (e.g. a forgotten dev API worker) fails fast
  // instead of hanging the script indefinitely while holding up the wait queue.
  await db.execute(sql`SET lock_timeout = '5s'`);
  // DDL does not accept bind parameters, so the marker (a fixed, script-owned literal —
  // never user input) is inlined via sql.raw rather than a parameterized value.
  await db.execute(sql`
    ALTER TABLE email_message
    ADD CONSTRAINT ${sql.identifier(CONSTRAINT_NAME)}
    CHECK (to_address NOT LIKE ${sql.raw(`'%${PROBE_MARKER}%'`)})
  `);
}

async function dropFailingConstraint(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE email_message DROP CONSTRAINT IF EXISTS ${sql.identifier(CONSTRAINT_NAME)}
  `);
}

async function cleanup(): Promise<void> {
  await dropFailingConstraint();
  await db.delete(authSchema.user).where(eq(authSchema.user.id, userId));
  await db.execute(sql`DELETE FROM email_message WHERE to_address = ${probeEmail}`);
  await db.execute(sql`DELETE FROM outbox_event WHERE aggregate_id = ${userId}`);
}

async function main(): Promise<void> {
  await cleanup();
  await seedUser();
  await addFailingConstraint();

  const outbox = new DrizzleOutboxRepository(instrumentation);
  const email = new QueuedEmailService(new DrizzleEmailQueue(instrumentation), instrumentation);
  const service = new RgpdService(
    new DrizzleRgpdRepository(logger, instrumentation),
    new NoOpStorageService(),
    email,
    new TransactionService(),
    outbox,
    instrumentation,
  );

  const result = await service.executeAccountWipe({ userId });

  console.log("[1] executeAccountWipe result ->", result.isFailure ? result.getError() : "success");
  assert(result.isFailure, "the wipe reports failure when the confirmation enqueue fails");
  assert(
    result.isFailure && result.getError().code === "ACCOUNT_WIPE_NOTIFY_PROVIDER_FAILURE",
    "the failure code is ACCOUNT_WIPE_NOTIFY_PROVIDER_FAILURE",
  );

  const [row] = await db
    .select({
      email: authSchema.user.email,
      deletedAt: authSchema.user.deletedAt,
      pendingDeletionUntil: authSchema.user.pendingDeletionUntil,
    })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, userId))
    .limit(1);

  console.log("[2] user row after failed wipe ->", row);
  assert(row !== undefined, "the user row still exists");
  assert(row?.deletedAt === null, "deleted_at is still NULL — the wipe did not persist");
  assert(row?.email === probeEmail, "the email was not anonymized — the wipe did not persist");

  const readyForWipe = await new DrizzleRgpdRepository(
    logger,
    instrumentation,
  ).findUsersReadyForWipe(50);
  const stillPending =
    readyForWipe.isSuccess && readyForWipe.getValue().some((r) => r.userId === userId);
  console.log("[3] still returned by findUsersReadyForWipe ->", stillPending);
  assert(stillPending, "the account is still picked up by the next sweep (not lost)");

  await cleanup();

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed — the wipe transaction genuinely rolled back.");
  process.exit(0);
}

main().catch(async (err) => {
  console.error("check-wipe-rollback crashed:", err);
  await cleanup().catch(() => {});
  process.exit(1);
});
