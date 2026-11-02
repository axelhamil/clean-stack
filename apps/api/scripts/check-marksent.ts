import { checkRecorder } from "./check-harness";
import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-marksent");

import { db, emailSchema, inArray } from "@packages/drizzle";
import type { EmailLease } from "../src/shared/ports/email-queue.port";
import { DrizzleEmailQueue } from "../src/shared/services/drizzle-email-queue.service";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";

const em = emailSchema.emailMessage;
const ids = ["check-marksent-a", "check-marksent-b", "check-marksent-c"];
const allNullIds = ["check-marksent-d", "check-marksent-e"];
const staleId = "check-marksent-stale";
const ATTEMPTS = 2;

const checks = checkRecorder();
const { check } = checks;

async function cleanup(): Promise<void> {
  await db.delete(em).where(inArray(em.id, [...ids, ...allNullIds, staleId]));
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
    attempts: ATTEMPTS,
    nextAttemptAt: new Date(Date.now() + 60_000),
    lastError: "prior failure",
    idempotencyKey: null,
  }));
}

const leasesOf = (rowIds: string[], attempts = ATTEMPTS): EmailLease[] =>
  rowIds.map((id) => ({ id, attempts }));

async function rowsOf(rowIds: string[]) {
  return db
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
    .where(inArray(em.id, rowIds));
}

async function main(): Promise<void> {
  await cleanup();
  await db.insert(em).values(seedRows([...ids, ...allNullIds, staleId]));

  const queue = new DrizzleEmailQueue(new NoOpInstrumentation());
  const result = await queue.markSent(leasesOf(ids), {
    "check-marksent-a": "p1",
    "check-marksent-b": "p2",
  });
  check(
    "markSent reports every current lease written",
    result.isSuccess && result.getValue().length === 3,
  );

  const rows = await rowsOf(ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const firstSentAt = rows[0]?.sentAt?.getTime();

  check("all three rows still exist", rows.length === 3);
  check(
    "all three rows are marked sent",
    rows.every((r) => r.status === "sent"),
  );
  check(
    "sent_at comes from the database and is identical across the batch",
    firstSentAt !== undefined && rows.every((r) => r.sentAt?.getTime() === firstSentAt),
  );
  check(
    "id a resolves to provider message id p1",
    byId.get("check-marksent-a")?.providerMessageId === "p1",
  );
  check(
    "id b resolves to provider message id p2",
    byId.get("check-marksent-b")?.providerMessageId === "p2",
  );
  check(
    "id c absent from the map falls back to NULL",
    byId.get("check-marksent-c")?.providerMessageId === null,
  );
  check(
    "the settle leaves attempts as the claim counted them",
    rows.every((r) => r.attempts === ATTEMPTS),
  );
  check(
    "nextAttemptAt and lastError are cleared",
    rows.every((r) => r.nextAttemptAt === null && r.lastError === null),
  );

  const resent = await queue.markSent(leasesOf(ids), {});
  check(
    "markSent on rows already sent writes nothing",
    resent.isSuccess && resent.getValue().length === 0,
  );

  const allNullResult = await queue.markSent(leasesOf(allNullIds), {});
  const allNullRows = await rowsOf(allNullIds);
  check("markSent with an empty provider-message-id map reports success", allNullResult.isSuccess);
  check(
    "both all-NULL rows land sent with provider_message_id IS NULL",
    allNullRows.length === 2 &&
      allNullRows.every((r) => r.status === "sent" && r.providerMessageId === null),
  );

  const stale = await queue.markSent(leasesOf([staleId], ATTEMPTS - 1), { [staleId]: "p9" });
  const [staleRow] = await rowsOf([staleId]);
  check(
    "markSent with a stale lease writes nothing",
    stale.isSuccess &&
      stale.getValue().length === 0 &&
      staleRow?.status === "pending" &&
      staleRow.providerMessageId === null,
  );

  const emptyResult = await queue.markSent([], {});
  check("markSent([]) is a no-op", emptyResult.isSuccess && emptyResult.getValue().length === 0);

  await cleanup();

  if (checks.failures > 0) {
    console.error(`\n${checks.failures} check(s) failed`);
    process.exit(1);
  }
  console.log(
    "\nAll assertions passed, markSent settles only current leases in one CASE statement.",
  );
  process.exit(0);
}

main().catch(async (err) => {
  console.error("check-marksent crashed:", err);
  await cleanup().catch(() => {});
  process.exit(1);
});
