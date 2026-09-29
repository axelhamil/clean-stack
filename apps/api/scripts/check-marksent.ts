/**
 * Proves against a real Postgres that `DrizzleEmailQueue.markSent` correctly evaluates
 * the CASE expression it builds for `provider_message_id` and increments `attempts`
 * from its prior value — behaviour a mocked `tx` can never exercise (see
 * `apps/api/src/shared/CLAUDE.md` on asserting call shape only against a mock).
 */

import { checkRecorder } from "./check-harness";
import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-marksent");

import { db, emailSchema, inArray } from "@packages/drizzle";
import { DrizzleEmailQueue } from "../src/shared/services/drizzle-email-queue.service";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";

const em = emailSchema.emailMessage;
const ids = ["check-marksent-a", "check-marksent-b", "check-marksent-c"];
const allNullIds = ["check-marksent-d", "check-marksent-e"];

const checks = checkRecorder();
const { check } = checks;

async function cleanup(): Promise<void> {
  await db.delete(em).where(inArray(em.id, [...ids, ...allNullIds]));
}

function seedRows(rowIds: string[]) {
  return rowIds.map((id) => ({
    id,
    kind: "raw" as const,
    template: null,
    toAddress: `${id}@example.test`,
    subject: "check-marksent",
    locale: "en" as const,
    payload: {},
    status: "pending" as const,
    attempts: 2,
    nextAttemptAt: new Date(Date.now() + 60_000),
    lastError: "prior failure",
    idempotencyKey: null,
  }));
}

async function seed(): Promise<void> {
  await db.insert(em).values(seedRows(ids));
}

async function main(): Promise<void> {
  await cleanup();
  await seed();

  const queue = new DrizzleEmailQueue(new NoOpInstrumentation());
  const sentAt = new Date();

  const result = await db.transaction(async (tx) =>
    queue.markSent(ids, sentAt, { "check-marksent-a": "p1", "check-marksent-b": "p2" }, tx),
  );

  console.log("[1] markSent result ->", result.isFailure ? result.getError() : "success");
  check("markSent reports success", result.isSuccess);

  const rows = await db
    .select({
      id: em.id,
      status: em.status,
      sentAt: em.sentAt,
      providerMessageId: em.providerMessageId,
      attempts: em.attempts,
      nextAttemptAt: em.nextAttemptAt,
      lastError: em.lastError,
    })
    .from(em)
    .where(inArray(em.id, ids));

  console.log("[2] rows after markSent ->", JSON.stringify(rows));

  const byId = new Map(rows.map((r) => [r.id, r]));
  const a = byId.get("check-marksent-a");
  const b = byId.get("check-marksent-b");
  const c = byId.get("check-marksent-c");

  check("all three rows still exist", rows.length === 3);
  check(
    "all three rows are marked sent",
    rows.every((r) => r.status === "sent"),
  );
  check(
    "sentAt is the single timestamp passed by the caller, identical across the batch",
    rows.every((r) => r.sentAt?.getTime() === sentAt.getTime()),
  );
  check("id a resolves to provider message id p1", a?.providerMessageId === "p1");
  check("id b resolves to provider message id p2", b?.providerMessageId === "p2");
  check("id c absent from the map falls back to NULL", c?.providerMessageId === null);
  check(
    "attempts incremented from 2 to 3, not reset to 1",
    rows.every((r) => r.attempts === 3),
  );
  check(
    "nextAttemptAt is cleared",
    rows.every((r) => r.nextAttemptAt === null),
  );
  check(
    "lastError is cleared",
    rows.every((r) => r.lastError === null),
  );

  // All-NULL branch: ids are present but the provider-message-id map is empty, so every
  // `WHEN id = ... THEN ...` arm of the CASE is absent and the expression degenerates to a
  // bare `ELSE NULL` — the one shape Postgres can fail to resolve a type for. This is
  // distinct from the `c` case above (map non-empty, one id absent from it).
  await db.insert(em).values(seedRows(allNullIds));
  const allNullResult = await db.transaction(async (tx) =>
    queue.markSent(allNullIds, sentAt, {}, tx),
  );
  console.log(
    "[3] all-NULL markSent result ->",
    allNullResult.isFailure ? allNullResult.getError() : "success",
  );
  check("markSent with an empty provider-message-id map reports success", allNullResult.isSuccess);

  const allNullRows = await db
    .select({ id: em.id, status: em.status, providerMessageId: em.providerMessageId })
    .from(em)
    .where(inArray(em.id, allNullIds));
  check("both all-NULL rows still exist", allNullRows.length === 2);
  check(
    "both all-NULL rows still land sent",
    allNullRows.every((r) => r.status === "sent"),
  );
  check(
    "both all-NULL rows have provider_message_id IS NULL",
    allNullRows.every((r) => r.providerMessageId === null),
  );

  // Empty ids must be a no-op — no `WHERE id IN ()` should be emitted, and no row touched.
  const emptyResult = await db.transaction(async (tx) => queue.markSent([], sentAt, {}, tx));
  check("markSent([]) reports success", emptyResult.isSuccess);

  const untouchedCount = await db.select({ id: em.id }).from(em).where(inArray(em.id, ids));
  check("empty ids call left the rows untouched", untouchedCount.length === 3);

  await cleanup();

  if (checks.failures > 0) {
    console.error(`\n${checks.failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed — markSent's single-statement CASE is correct.");
  process.exit(0);
}

main().catch(async (err) => {
  console.error("check-marksent crashed:", err);
  await cleanup().catch(() => {});
  process.exit(1);
});
