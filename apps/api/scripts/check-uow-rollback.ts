/**
 * Proves against a real Postgres that `TransactionService.run` rolls back a transaction
 * whose callback resolves to a failed `Result`, and still commits one that succeeds.
 *
 * A mocked unit of work can only prove the service throws inside `db.transaction`; only
 * a real database can prove the write that happened before the failure is discarded,
 * together with the outbox row emitted in the same transaction.
 */

import { checkRecorder } from "./check-harness";
import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-uow-rollback");

import { Result } from "@packages/ddd-kit";
import { authSchema, db, eq, outboxSchema, TransactionService } from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { emitEvent } from "../src/shared/event-emitter";
import type { IInstrumentation } from "../src/shared/ports/instrumentation.port";
import { DrizzleOutboxRepository } from "../src/shared/services/drizzle-outbox.service";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";

const instrumentation: IInstrumentation = new NoOpInstrumentation();
const userId = `check-uow-rollback-${crypto.randomUUID()}`;
const ORIGINAL_NAME = "Uow Rollback Probe";

const checks = checkRecorder();
const { check } = checks;

async function cleanup(): Promise<void> {
  await db.delete(outboxSchema.outboxEvent).where(eq(outboxSchema.outboxEvent.aggregateId, userId));
  await db.delete(authSchema.user).where(eq(authSchema.user.id, userId));
}

async function currentName(): Promise<string | undefined> {
  const [row] = await db
    .select({ name: authSchema.user.name })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, userId))
    .limit(1);

  return row?.name;
}

async function outboxRows(): Promise<number> {
  const rows = await db
    .select({ id: outboxSchema.outboxEvent.id })
    .from(outboxSchema.outboxEvent)
    .where(eq(outboxSchema.outboxEvent.aggregateId, userId));

  return rows.length;
}

async function main(): Promise<void> {
  await cleanup();
  await db.insert(authSchema.user).values({
    id: userId,
    name: ORIGINAL_NAME,
    email: `${userId}@example.com`,
    emailVerified: true,
  });

  const outbox = new DrizzleOutboxRepository(instrumentation);
  const uow = new TransactionService(instrumentation);

  const renameThen = (name: string, outcome: Result<void, string>) =>
    uow.run(async (tx) => {
      await tx.update(authSchema.user).set({ name }).where(eq(authSchema.user.id, userId));
      await emitEvent(
        outbox,
        EventTypes.USER_PROFILE_UPDATED,
        "user",
        userId,
        { userId, changes: { name } },
        {},
        tx,
      );

      return outcome;
    });

  const failed = await renameThen("Renamed then failed", Result.fail("probe failure"));
  console.log("[1] run resolved to ->", failed.isFailure ? failed.getError() : "success");
  check("run resolves to the failed Result the callback returned", failed.isFailure);
  check("the write before the failure was rolled back", (await currentName()) === ORIGINAL_NAME);
  check("the event emitted before the failure was rolled back", (await outboxRows()) === 0);

  const succeeded = await renameThen("Renamed", Result.ok());
  console.log("[2] run resolved to ->", succeeded.isFailure ? succeeded.getError() : "success");
  check("run resolves to the successful Result", succeeded.isSuccess);
  check("the write of a successful run is committed", (await currentName()) === "Renamed");
  check("the event of a successful run is committed", (await outboxRows()) === 1);

  await cleanup();

  if (checks.failures > 0) {
    console.error(`\n${checks.failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed, a failed Result rolls the unit of work back.");
  process.exit(0);
}

main().catch(async (err) => {
  console.error("check-uow-rollback crashed:", err);
  await cleanup().catch(() => {});
  process.exit(1);
});
