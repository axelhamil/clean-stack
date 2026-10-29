/**
 * Proves against a real Postgres that `TransactionService.run` rolls back a transaction
 * whose callback resolves to a failed `Result`, still commits one that succeeds, and
 * rethrows a callback's exception without reporting it (the caller knows if it is expected).
 * A nested `run` joins the open transaction (same backend, same txid), a failure at any
 * depth rolls everything back, and a promise that outlives its run reads the pool.
 *
 * A mocked unit of work can only prove the service throws inside `db.transaction`; only
 * a real database can prove the write that happened before the failure is discarded,
 * together with the outbox row emitted in the same transaction.
 */

import { checkRecorder } from "./check-harness";
import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-uow-rollback");

import { EventCollector, Result } from "@packages/ddd-kit";
import {
  authSchema,
  type DbClient,
  db,
  eq,
  outboxSchema,
  resolveExecutor,
  sql,
  type Transaction,
  TransactionService,
} from "@packages/drizzle";
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

async function currentImage(): Promise<string | null | undefined> {
  const [row] = await db
    .select({ image: authSchema.user.image })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, userId))
    .limit(1);

  return row?.image;
}

interface Backend {
  pid: number;
  txid: string;
}

async function backendOf(executor: DbClient | Transaction): Promise<Backend | undefined> {
  const { rows } = await executor.execute<{ pid: number; txid: string }>(
    sql`select pg_backend_pid() as pid, txid_current()::text as txid`,
  );

  return rows[0];
}

const sameBackend = (a: Backend | undefined, b: Backend | undefined): boolean =>
  a !== undefined && b !== undefined && a.pid === b.pid && a.txid === b.txid;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function outboxRows(): Promise<number> {
  const rows = await db
    .select({ id: outboxSchema.outboxEvent.id })
    .from(outboxSchema.outboxEvent)
    .where(eq(outboxSchema.outboxEvent.aggregateId, userId));

  return rows.length;
}

async function resetProbe(): Promise<void> {
  await cleanup();
  await db.insert(authSchema.user).values({
    id: userId,
    name: ORIGINAL_NAME,
    email: `${userId}@example.com`,
    emailVerified: true,
  });
}

async function main(): Promise<void> {
  await resetProbe();

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

  let captures = 0;
  const spy: IInstrumentation = Object.assign(Object.create(instrumentation), {
    capture: () => {
      captures += 1;
    },
  });
  const expected = new Error("probe: an expected 4xx thrown to abort");
  const thrown = await new TransactionService(spy)
    .run(async (tx) => {
      await tx
        .update(authSchema.user)
        .set({ name: "Thrown" })
        .where(eq(authSchema.user.id, userId));
      throw expected;
    })
    .catch((err: unknown) => err);
  console.log("[3] run rejected with ->", thrown === expected ? "the callback's error" : thrown);
  check("a thrown error reaches the caller unchanged", thrown === expected);
  check("the write before the throw was rolled back", (await currentName()) === "Renamed");
  check("the unit of work leaves reporting to the caller (no capture)", captures === 0);

  await resetProbe();
  const outerThenNested = await uow.run(async (tx) => {
    const outer = await backendOf(tx);
    const nested = await uow.run(async (inner) => ({
      handed: inner === tx,
      ambient: await backendOf(resolveExecutor()),
    }));

    return { outer, nested };
  });
  console.log("[4] backends ->", outerThenNested.outer, outerThenNested.nested.ambient);
  check(
    "nested run joins the open transaction (one pid for both)",
    outerThenNested.nested.handed &&
      sameBackend(outerThenNested.outer, outerThenNested.nested.ambient),
  );

  const nestedFailure = Result.fail("probe nested failure");
  const failedDeep = await uow.run(async (tx) => {
    await tx
      .update(authSchema.user)
      .set({ name: "Outer write" })
      .where(eq(authSchema.user.id, userId));
    await emitEvent(
      outbox,
      EventTypes.USER_PROFILE_UPDATED,
      "user",
      userId,
      { userId, changes: {} },
      {},
      tx,
    );

    return uow.run(async () => nestedFailure);
  });
  console.log("[5] outer resolved to ->", failedDeep.isFailure ? failedDeep.getError() : "success");
  check(
    "nested failure rolls back the outer write and returns the same Result",
    failedDeep === nestedFailure &&
      (await currentName()) === ORIGINAL_NAME &&
      (await outboxRows()) === 0,
  );

  const swallowed = await uow.run(async (tx) => {
    await tx
      .update(authSchema.user)
      .set({ name: "Outer write" })
      .where(eq(authSchema.user.id, userId));
    await uow.run(async () => nestedFailure).catch(() => undefined);

    return Result.ok();
  });
  check(
    "a nested failure the outer work swallows still rolls back and is returned",
    swallowed === nestedFailure && (await currentName()) === ORIGINAL_NAME,
  );

  const nestedError = new Error("probe: thrown in a nested run");
  const thrownDeep = await uow
    .run(async (tx) => {
      await tx
        .update(authSchema.user)
        .set({ name: "Outer write" })
        .where(eq(authSchema.user.id, userId));

      return uow.run(async () => {
        throw nestedError;
      });
    })
    .catch((err: unknown) => err);
  check(
    "a thrown error in nested rolls back and propagates",
    thrownDeep === nestedError && (await currentName()) === ORIGINAL_NAME,
  );

  const leaked = await uow.run(async (tx) => {
    const inside = await backendOf(tx);
    const late = (async () => {
      await pause(30);
      const executor = resolveExecutor();

      return { onPool: executor === db, backend: await backendOf(executor) };
    })();

    return { inside, late };
  });
  const afterCommit = await leaked.late;
  console.log("[6] late backend ->", afterCommit.backend, "run backend ->", leaked.inside);
  check(
    "a promise started in a run and awaited after commit uses the pool, not the dead tx",
    afterCommit.onPool &&
      afterCommit.backend !== undefined &&
      afterCommit.backend.txid !== leaked.inside?.txid,
  );

  const timed = await uow.run(async (tx) => {
    const before = await backendOf(tx);
    await pause(20);
    const executor = resolveExecutor();

    return { sameTx: executor === tx, before, after: await backendOf(executor) };
  });
  check(
    "a repository call inside a run after a setTimeout still sees the run's pid",
    timed.sameTx && sameBackend(timed.before, timed.after),
  );

  const bothCommitted = await uow.run(async (tx) => {
    const nested = await uow.run(async (inner) => {
      await inner
        .update(authSchema.user)
        .set({ name: "Nested write" })
        .where(eq(authSchema.user.id, userId));
      await emitEvent(
        outbox,
        EventTypes.USER_PROFILE_UPDATED,
        "user",
        userId,
        { userId, changes: {} },
        {},
        inner,
      );

      return Result.ok();
    });
    if (nested.isFailure) return nested;

    await tx
      .update(authSchema.user)
      .set({ image: "outer-write" })
      .where(eq(authSchema.user.id, userId));

    return Result.ok();
  });
  check(
    "an outer write after a successful nested run commits both",
    bothCommitted.isSuccess &&
      (await currentName()) === "Nested write" &&
      (await currentImage()) === "outer-write" &&
      (await outboxRows()) === 1,
  );

  await resetProbe();
  const unpersistable = await uow
    .run(async (tx) => {
      await tx
        .update(authSchema.user)
        .set({ name: "Written with a lost event" })
        .where(eq(authSchema.user.id, userId));
      EventCollector.add({
        eventType: EventTypes.USER_PROFILE_UPDATED,
        dateOccurred: new Date(),
        aggregateId: userId,
        payload: { userId, changes: {} },
      });

      return Result.ok();
    })
    .catch((err: unknown) => err);
  console.log(
    "[7] run without outbox ->",
    unpersistable instanceof Error ? unpersistable.message : unpersistable,
  );
  check(
    "a run with events and no flush handler rolls back its writes",
    unpersistable instanceof Error &&
      unpersistable.message.includes(EventTypes.USER_PROFILE_UPDATED) &&
      (await currentName()) === ORIGINAL_NAME,
  );

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
