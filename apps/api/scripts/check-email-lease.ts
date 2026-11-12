import { requireLocalDatabase } from "@packages/test/require-local-database";

requireLocalDatabase("check-email-lease");

import { uuidv7 } from "@packages/ddd-kit";
import {
  and,
  count,
  db,
  emailSchema,
  eq,
  gt,
  inArray,
  isDeadDue,
  isDue,
  like,
  or,
} from "@packages/drizzle";
import { DrizzleEmailQueue } from "@packages/email/drizzle-email-queue";
import type { EmailClaimRequest, EmailMessageRecord } from "@packages/email/email-queue.port";
import {
  checkRun,
  probeClaims,
  recordingInstrumentation,
  refuseForeignRows,
  withClockAhead,
} from "@packages/test/check-harness";
import { logger } from "../src/shared/logger";

const PROBE = `check-email-lease-${crypto.randomUUID()}`;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const { instrumentation, spans } = recordingInstrumentation();
const queue = new DrizzleEmailQueue(instrumentation, logger);
const em = emailSchema.emailMessage;

async function cleanup(): Promise<void> {
  await db.delete(em).where(like(em.toAddress, `${PROBE}%`));
}

const { step, fail, run } = checkRun("check-email-lease", cleanup);

async function seed(
  count: number,
  overrides: Partial<typeof em.$inferInsert> = {},
): Promise<string[]> {
  const base = Date.now() - 60_000;
  const rows = Array.from({ length: count }, (_, index) => ({
    id: uuidv7(),
    kind: "raw" as const,
    template: null,
    toAddress: `${PROBE}-${index}@example.test`,
    subject: "check-email-lease",
    locale: "en" as const,
    payload: {},
    createdAt: new Date(base + index),
    ...overrides,
  }));
  await db.insert(em).values(rows);

  return rows.map((row) => row.id);
}

const isProbe = (record: EmailMessageRecord) => record.toAddress.startsWith(PROBE);

const claims = probeClaims({
  claim: (request: Partial<EmailClaimRequest>) =>
    queue.claim({ limit: 50, leaseSeconds: 120, deadReplayWindowHours: 24, ...request }),
  release: (foreign: EmailMessageRecord[]) => queue.release(foreign),
  isProbe,
  fail,
});
const claimedAll = (request: Partial<EmailClaimRequest> = {}) => claims.all(request);
const claimed = (request: Partial<EmailClaimRequest> = {}) => claims.probes(request);

async function rowOf(id: string) {
  const [row] = await db.select().from(em).where(eq(em.id, id));
  if (!row) return fail(`row ${id} exists`);

  return row;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const ids = (records: EmailMessageRecord[]) => records.map((record) => record.id);

async function refuseForeignClaimable(): Promise<void> {
  const inWindow = gt(em.createdAt, new Date(Date.now() - DAY_MS));
  const [claimable] = await db
    .select({ found: count() })
    .from(em)
    .where(
      or(
        and(eq(em.status, "pending"), isDue(em.nextAttemptAt)),
        and(eq(em.status, "dead"), isDeadDue(em.nextAttemptAt), inWindow),
      ),
    );
  refuseForeignRows("check-email-lease", {
    found: claimable?.found ?? 0,
    rows: "claimable email_message rows",
    clean: "delete from email_message where status in ('pending', 'dead')",
  });
}

async function main(): Promise<void> {
  await cleanup();
  await refuseForeignClaimable();

  await claimed({ limit: 1 });
  const claimSql = spans.find((name) => name.includes('from "due"')) ?? "";
  await step(
    "the claim locks its three CTEs with for update skip locked and settles them in one update",
    claimSql.match(/for update skip locked/g)?.length === 3 &&
      claimSql.includes("union all") &&
      /update "email_message" set .* from "due"/.test(claimSql),
    claimSql,
  );

  const seeded = await seed(30);
  const [first, second] = await Promise.all([claimed({ limit: 20 }), claimed({ limit: 20 })]);
  const overlap = ids(first).filter((id) => ids(second).includes(id));
  await step("two concurrent claims return disjoint rows", overlap.length === 0, {
    first: first.length,
    second: second.length,
  });
  await step(
    "together they claim every due row once",
    first.length + second.length === seeded.length,
    first.length + second.length,
  );

  await cleanup();
  const [leasedId = ""] = await seed(1);
  const leased = await claimed({ leaseSeconds: 1 });
  const hidden = await claimed();
  await pause(1_500);
  const reclaimed = await claimed({ leaseSeconds: 120 });
  await step(
    "a claimed row is invisible until its lease expires, then claimable with attempts + 1",
    ids(leased).join() === leasedId &&
      hidden.length === 0 &&
      ids(reclaimed).join() === leasedId &&
      leased[0]?.attempts === 1 &&
      reclaimed[0]?.attempts === 2,
    { leased: leased.length, hidden: hidden.length, reclaimed: reclaimed[0]?.attempts },
  );

  const aheadClaim = await withClockAhead(DAY_MS, () => claimed());
  await step(
    "the lease is read on the database clock: a process clock a day ahead claims nothing",
    aheadClaim.length === 0,
    ids(aheadClaim),
  );

  const staleSent = await queue.markSent([{ id: leasedId, attempts: 1 }], { [leasedId]: "p" });
  const staleFailed = await queue.markFailed([{ id: leasedId, attempts: 1 }], {
    lastError: "stale",
    status: "dead",
    retryAfterSeconds: 0,
  });
  const afterStale = await rowOf(leasedId);
  await step(
    "markSent with a stale attempts value writes nothing and says so",
    staleSent.isSuccess &&
      staleSent.getValue().length === 0 &&
      afterStale.status === "pending" &&
      afterStale.sentAt === null,
    afterStale,
  );
  await step(
    "markFailed with a stale attempts value writes nothing and says so",
    staleFailed.isSuccess &&
      staleFailed.getValue().length === 0 &&
      afterStale.lastError !== "stale",
    afterStale,
  );

  const retried = await queue.markFailed([{ id: leasedId, attempts: 2 }], {
    lastError: "HTTP 503",
    status: "pending",
    retryAfterSeconds: 3_600,
  });
  const afterRetry = await rowOf(leasedId);
  const notDue = await claimed();
  await step(
    "markFailed on the current lease schedules the retry on the database clock",
    retried.isSuccess &&
      retried.getValue().length === 1 &&
      afterRetry.status === "pending" &&
      afterRetry.attempts === 2 &&
      (afterRetry.nextAttemptAt?.getTime() ?? 0) > Date.now() + HOUR_MS - 60_000 &&
      notDue.length === 0,
    afterRetry,
  );

  await cleanup();
  const [deadId = ""] = await seed(1, {
    status: "dead",
    attempts: 5,
    nextAttemptAt: new Date(Date.now() + HOUR_MS),
  });
  const deadNotYet = await claimed();
  await db
    .update(em)
    .set({ nextAttemptAt: new Date(Date.now() - 1_000) })
    .where(eq(em.id, deadId));
  const [replayed] = await claimed();
  await step(
    "a dead message is claimed only when next_attempt_at is due, and claiming keeps it dead",
    deadNotYet.length === 0 &&
      replayed?.id === deadId &&
      replayed.status === "dead" &&
      replayed.attempts === 6,
    { notYet: deadNotYet.length, replayed: replayed?.status, attempts: replayed?.attempts },
  );
  const replaySent = await queue.markSent([{ id: deadId, attempts: 6 }], {});
  const afterReplay = await rowOf(deadId);
  await step(
    "a delivered dead replay lands sent",
    replaySent.isSuccess &&
      replaySent.getValue().length === 1 &&
      afterReplay.status === "sent" &&
      afterReplay.attempts === 6,
    afterReplay,
  );

  await cleanup();
  await seed(1, {
    status: "dead",
    nextAttemptAt: new Date(Date.now() - HOUR_MS),
    createdAt: new Date(Date.now() - 2 * DAY_MS),
  });
  const pastWindow = await claimed({ deadReplayWindowHours: 24 });
  await step(
    "a dead message older than the replay window is never claimed",
    pastWindow.length === 0,
    ids(pastWindow),
  );

  await cleanup();
  await seed(8, { status: "dead", nextAttemptAt: new Date(Date.now() - HOUR_MS) });
  await seed(8);
  const mixed = await claimedAll({ limit: 8 });
  const deadShare = mixed.filter((record) => record.status === "dead").length;
  await step(
    "dead replays take at most a quarter of a claim so live rows are never starved",
    mixed.length === 8 && deadShare === 2,
    { claimed: mixed.length, dead: deadShare },
  );

  await cleanup();
  const [releasedId = ""] = await seed(1, { attempts: 3 });
  const [toRelease] = await claimed();
  const staleRelease = await queue.release([{ id: releasedId, attempts: 3 }]);
  const released = await queue.release([{ id: releasedId, attempts: toRelease?.attempts ?? -1 }]);
  const afterRelease = await rowOf(releasedId);
  const [reclaimedAfterRelease] = await claimed();
  await step(
    "release gives the attempt back and makes the row claimable at once",
    toRelease?.attempts === 4 &&
      staleRelease.isSuccess &&
      staleRelease.getValue() === 0 &&
      released.isSuccess &&
      released.getValue() === 1 &&
      afterRelease.attempts === 3 &&
      afterRelease.status === "pending" &&
      reclaimedAfterRelease?.attempts === 4,
    { afterRelease, reclaimed: reclaimedAfterRelease?.attempts },
  );

  await cleanup();
  const backlog = await seed(120);
  const batchIds = backlog.slice(99, 102);
  await db
    .update(em)
    .set({ batchKey: `${PROBE}-batch` })
    .where(inArray(em.id, batchIds));
  const acrossLimit = ids(await claimed({ limit: 100 }));
  await step(
    "a claim whose limit cuts a failed batch pulls the rest of the batch in the same claim",
    batchIds.every((id) => acrossLimit.includes(id)) && acrossLimit.length === 102,
    { claimed: acrossLimit.length, batch: batchIds.filter((id) => acrossLimit.includes(id)) },
  );

  await cleanup();
  const [heldId = "", lostId = ""] = await seed(2);
  const toAssign = await claimed();
  const leaseOf = (id: string) => toAssign.find((record) => record.id === id)?.attempts ?? -1;
  const assigned = await queue.assignBatch(
    [
      { id: heldId, attempts: leaseOf(heldId) },
      { id: lostId, attempts: leaseOf(lostId) - 1 },
    ],
    `${PROBE}-key`,
  );
  const [afterHeld, afterLost] = [await rowOf(heldId), await rowOf(lostId)];
  await step(
    "the batch key is written before the send, only on the rows this worker still leases",
    assigned.isSuccess &&
      assigned
        .getValue()
        .map((lease) => lease.id)
        .join() === heldId &&
      afterHeld.batchKey === `${PROBE}-key` &&
      afterLost.batchKey === null,
    { held: afterHeld.batchKey, lost: afterLost.batchKey },
  );
  await queue.markFailed([{ id: heldId, attempts: leaseOf(heldId) }], {
    lastError: "HTTP 503",
    status: "pending",
    retryAfterSeconds: 0,
  });
  const afterFailure = await rowOf(heldId);
  await step(
    "a retryable failure keeps the batch key so the replay rebuilds the same batch",
    afterFailure.batchKey === `${PROBE}-key` && afterFailure.status === "pending",
    afterFailure,
  );

  await cleanup();
  const deadBatch = { status: "dead" as const, attempts: 5, batchKey: `${PROBE}-dead-batch` };
  const [staleId = ""] = await seed(1, {
    ...deadBatch,
    nextAttemptAt: new Date(Date.now() - HOUR_MS),
    createdAt: new Date(Date.now() - 30 * HOUR_MS),
  });
  const [freshId = ""] = await seed(1, {
    ...deadBatch,
    nextAttemptAt: new Date(Date.now() - HOUR_MS),
    createdAt: new Date(Date.now() - 10 * HOUR_MS),
  });
  const deadReplay = await claimed({ deadReplayWindowHours: 24 });
  const afterStaleDead = await rowOf(staleId);
  await step(
    "a dead row past the replay window is never pulled in by a younger sibling, nor counted against it",
    ids(deadReplay).join() === freshId &&
      deadReplay[0]?.unsettledInBatch.unwrapOr(-1) === 1 &&
      afterStaleDead.status === "dead" &&
      afterStaleDead.attempts === 5,
    { claimed: ids(deadReplay), unsettled: deadReplay[0]?.unsettledInBatch.toNull() },
  );

  await cleanup();
  const lockedBatch = await seed(3, { attempts: 1, batchKey: `${PROBE}-locked-batch` });
  const [lockedId = ""] = lockedBatch;
  let unlock: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  let locked: () => void = () => {};
  const isLocked = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const holder = db.transaction(async (tx) => {
    await tx.select({ id: em.id }).from(em).where(eq(em.id, lockedId)).for("update");
    locked();
    await held;
  });
  await isLocked;
  const besideLock = await claimed();
  unlock();
  await holder;
  await step(
    "a claim that cannot lock a sibling reports the batch as larger than what it claimed",
    besideLock.length === 2 &&
      !ids(besideLock).includes(lockedId) &&
      besideLock.every((record) => record.unsettledInBatch.unwrapOr(-1) === 3),
    { claimed: ids(besideLock), unsettled: besideLock.map((r) => r.unsettledInBatch.toNull()) },
  );

  await cleanup();
  const [leasedSibling = ""] = await seed(3, { attempts: 1, batchKey: `${PROBE}-leased-batch` });
  await db
    .update(em)
    .set({ attempts: 2, nextAttemptAt: new Date(Date.now() + HOUR_MS) })
    .where(eq(em.id, leasedSibling));
  const besideLease = await claimed();
  await step(
    "a sibling leased by another worker still counts, so the claimed part is known incomplete",
    besideLease.length === 2 &&
      besideLease.every((record) => record.unsettledInBatch.unwrapOr(-1) === 3),
    { claimed: ids(besideLease), unsettled: besideLease.map((r) => r.unsettledInBatch.toNull()) },
  );

  await cleanup();
  const settledBatch = { batchKey: `${PROBE}-settled-batch` };
  await seed(1, { ...settledBatch, status: "sent", sentAt: new Date() });
  await seed(1, { ...settledBatch, status: "failed" });
  await seed(2, { ...settledBatch, attempts: 1 });
  const besideSettled = await claimed();
  await step(
    "sent or failed siblings are settled: they never make the rest of the batch incomplete",
    besideSettled.length === 2 &&
      besideSettled.every((record) => record.unsettledInBatch.unwrapOr(-1) === 2),
    {
      claimed: ids(besideSettled),
      unsettled: besideSettled.map((r) => r.unsettledInBatch.toNull()),
    },
  );

  await cleanup();
  const [inFlightId = ""] = await seed(1, { attempts: 3 });
  const [inFlight] = await claimed();
  const postponed = await queue.release(
    [{ id: inFlightId, attempts: inFlight?.attempts ?? -1 }],
    60,
  );
  const afterPostpone = await rowOf(inFlightId);
  const whilePostponed = await claimed();
  await step(
    "a delayed release gives the attempt back and keeps the row out of claims until the delay ends",
    postponed.isSuccess &&
      postponed.getValue() === 1 &&
      afterPostpone.status === "pending" &&
      afterPostpone.attempts === 3 &&
      (afterPostpone.nextAttemptAt?.getTime() ?? 0) > Date.now() + 50_000 &&
      whilePostponed.length === 0,
    afterPostpone,
  );

  await cleanup();
  const [failedId = ""] = await seed(1, { status: "failed", attempts: 1 });
  await seed(1, { status: "sent", attempts: 1, sentAt: new Date() });
  const terminal = await claimed();
  const settleFailed = await queue.markFailed([{ id: failedId, attempts: 1 }], {
    lastError: "again",
    status: "dead",
    retryAfterSeconds: 0,
  });
  await step(
    "a failed or sent message is never claimed nor settled again",
    terminal.length === 0 && settleFailed.isSuccess && settleFailed.getValue().length === 0,
    ids(terminal),
  );
}

run(main, "queued emails are claimed by lease and settled per attempt");
