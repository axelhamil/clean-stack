/**
 * Proves against a real Postgres that `DrizzleEmailQueue.enqueue`'s `onConflictDoNothing`
 * behaves the way the design assumes — behaviour a mocked `tx` can never exercise (see
 * `apps/api/src/shared/CLAUDE.md` on asserting call shape only against a mock, and on never
 * asserting on the SQL text a builder produced).
 *
 * The unit test suite (`drizzle-email-queue.service.test.ts`) mocks `onConflictDoNothing` as a
 * no-op passthrough and asserts on a return value the test itself controls (`insertReturns`) —
 * deleting `.onConflictDoNothing(...)` from the service leaves that suite green. Nothing there
 * proves:
 *   1. the conflict target is `idempotency_key`, not the primary key;
 *   2. a mixed batch of {an already-present key, a fresh key} inserts only the fresh row and
 *      reports `written: 1`;
 *   3. two rows with `idempotencyKey: Option.none()` (NULL) both insert — Postgres treats NULLs
 *      as distinct under a UNIQUE index, which is the entire premise the "no idempotency key
 *      supplied" callers rely on.
 * This script is that proof.
 */

import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-enqueue");

import { Option } from "@packages/ddd-kit";
import { db, emailSchema, inArray } from "@packages/drizzle";
import type { EmailMessageInsert } from "../src/shared/ports/email-queue.port";
import { DrizzleEmailQueue } from "../src/shared/services/drizzle-email-queue.service";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";

const em = emailSchema.emailMessage;
const MARKER = "check-enqueue";
const preExistingId = `${MARKER}-preexisting`;
const preExistingKey = `${MARKER}-preexisting-key`;
const freshKey = `${MARKER}-fresh-key`;
const nullKeyAddresses = [`${MARKER}-null-a@example.test`, `${MARKER}-null-b@example.test`];

let failures = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  OK: ${label}`);
  } else {
    failures += 1;
    console.log(`  ECHEC: ${label}`);
  }
}

async function deleteByAddresses(addresses: string[]): Promise<void> {
  await db.delete(em).where(inArray(em.toAddress, addresses));
}

function row(overrides: Partial<EmailMessageInsert> & { toAddress: string }): EmailMessageInsert {
  return {
    kind: "raw",
    template: Option.none(),
    subject: "check-enqueue",
    locale: "en",
    payload: {},
    idempotencyKey: Option.none(),
    ...overrides,
  };
}

async function seedPreExisting(): Promise<void> {
  await db.insert(em).values({
    id: preExistingId,
    kind: "raw",
    template: null,
    toAddress: `${MARKER}-preexisting@example.test`,
    subject: "pre-existing",
    locale: "en",
    payload: {},
    status: "pending",
    attempts: 0,
    nextAttemptAt: null,
    idempotencyKey: preExistingKey,
  });
}

async function main(): Promise<void> {
  const allAddresses = [
    `${MARKER}-preexisting@example.test`,
    `${MARKER}-fresh@example.test`,
    ...nullKeyAddresses,
  ];
  await deleteByAddresses(allAddresses);

  try {
    await seedPreExisting();

    const queue = new DrizzleEmailQueue(new NoOpInstrumentation());

    // [1] Mixed batch: one row whose idempotency_key already exists, one with a fresh key.
    const mixedResult = await queue.enqueue([
      row({
        toAddress: `${MARKER}-preexisting@example.test`,
        idempotencyKey: Option.some(preExistingKey),
      }),
      row({ toAddress: `${MARKER}-fresh@example.test`, idempotencyKey: Option.some(freshKey) }),
    ]);

    console.log(
      "[1] mixed batch enqueue result ->",
      mixedResult.isFailure ? mixedResult.getError() : mixedResult.getValue(),
    );
    assert(mixedResult.isSuccess, "mixed batch enqueue reports success");
    assert(
      mixedResult.isSuccess && mixedResult.getValue().written === 1,
      "mixed batch reports written: 1 (the duplicate was suppressed, not the fresh row)",
    );

    const freshRows = await db
      .select({ id: em.id, idempotencyKey: em.idempotencyKey })
      .from(em)
      .where(inArray(em.toAddress, [`${MARKER}-fresh@example.test`]));
    assert(freshRows.length === 1, "the fresh-key row was actually inserted");

    const preExistingRows = await db
      .select({ id: em.id })
      .from(em)
      .where(inArray(em.toAddress, [`${MARKER}-preexisting@example.test`]));
    assert(
      preExistingRows.length === 1 && preExistingRows[0]?.id === preExistingId,
      "the pre-existing row was not duplicated — still exactly the original row",
    );

    // [2] The conflict target is idempotency_key, not the primary key: re-enqueueing a batch
    // whose ids are brand-new but whose idempotency key collides with the pre-existing row
    // must still be suppressed by onConflictDoNothing, proving the target is the key column.
    const conflictOnKeyOnlyResult = await queue.enqueue([
      row({
        toAddress: `${MARKER}-preexisting@example.test`,
        idempotencyKey: Option.some(preExistingKey),
      }),
    ]);
    assert(conflictOnKeyOnlyResult.isSuccess, "re-enqueue against an existing key reports success");
    assert(
      conflictOnKeyOnlyResult.isSuccess && conflictOnKeyOnlyResult.getValue().written === 0,
      "re-enqueue against an existing key writes nothing — proves the conflict target is idempotency_key",
    );
    const stillOneRow = await db
      .select({ id: em.id })
      .from(em)
      .where(inArray(em.toAddress, [`${MARKER}-preexisting@example.test`]));
    assert(
      stillOneRow.length === 1,
      "still exactly one row for the colliding key — no duplicate slipped in by id",
    );

    // [3] Two rows with idempotencyKey: Option.none() (NULL) — Postgres treats NULLs as
    // distinct under a UNIQUE index, so both must insert.
    const nullKeyResult = await queue.enqueue([
      row({ toAddress: nullKeyAddresses[0] as string, idempotencyKey: Option.none() }),
      row({ toAddress: nullKeyAddresses[1] as string, idempotencyKey: Option.none() }),
    ]);
    console.log(
      "[3] NULL-key batch enqueue result ->",
      nullKeyResult.isFailure ? nullKeyResult.getError() : nullKeyResult.getValue(),
    );
    assert(nullKeyResult.isSuccess, "NULL-key batch enqueue reports success");
    assert(
      nullKeyResult.isSuccess && nullKeyResult.getValue().written === 2,
      "both NULL-key rows insert — Postgres does not treat NULL = NULL as a conflict",
    );
    const nullKeyRows = await db
      .select({ id: em.id, idempotencyKey: em.idempotencyKey })
      .from(em)
      .where(inArray(em.toAddress, nullKeyAddresses));
    assert(nullKeyRows.length === 2, "both NULL-key rows are actually present");
    assert(
      nullKeyRows.every((r) => r.idempotencyKey === null),
      "both rows genuinely stored NULL, not an empty string or placeholder",
    );

    await deleteByAddresses(allAddresses);

    if (failures > 0) {
      console.error(`\n${failures} assertion(s) failed`);
      process.exit(1);
    }
    console.log("\nAll assertions passed — enqueue's onConflictDoNothing is correct.");
    process.exit(0);
  } catch (err) {
    console.error("check-enqueue crashed:", err);
    await deleteByAddresses(allAddresses).catch(() => {});
    process.exit(1);
  }
}

main();
