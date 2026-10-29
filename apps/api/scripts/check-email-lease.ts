import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-email-lease");

import { uuidv7 } from "@packages/ddd-kit";
import { db, emailSchema, eq, like } from "@packages/drizzle";
import type { EmailClaimRequest, EmailMessageRecord } from "../src/shared/ports/email-queue.port";
import { DrizzleEmailQueue } from "../src/shared/services/drizzle-email-queue.service";
import { checkRun, probeClaims, recordingInstrumentation, withClockAhead } from "./check-harness";

const PROBE = `check-email-lease-${crypto.randomUUID()}`;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const { instrumentation, spans } = recordingInstrumentation();
const queue = new DrizzleEmailQueue(instrumentation);
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

async function main(): Promise<void> {
  await cleanup();

  await claimed({ limit: 1 });
  const claimSql = spans.find((name) => name.includes('from "due"')) ?? "";
  await step(
    "the claim locks both CTEs with for update skip locked and settles them in one update",
    claimSql.match(/for update skip locked/g)?.length === 2 &&
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
  const staleFailed = await queue.markFailed(
    { id: leasedId, attempts: 1 },
    { lastError: "stale", status: "dead", retryAfterSeconds: 0 },
  );
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
    staleFailed.isSuccess && staleFailed.getValue() === false && afterStale.lastError !== "stale",
    afterStale,
  );

  const retried = await queue.markFailed(
    { id: leasedId, attempts: 2 },
    { lastError: "HTTP 503", status: "pending", retryAfterSeconds: 3_600 },
  );
  const afterRetry = await rowOf(leasedId);
  const notDue = await claimed();
  await step(
    "markFailed on the current lease schedules the retry on the database clock",
    retried.isSuccess &&
      retried.getValue() === true &&
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
  const [failedId = ""] = await seed(1, { status: "failed", attempts: 1 });
  await seed(1, { status: "sent", attempts: 1, sentAt: new Date() });
  const terminal = await claimed();
  const settleFailed = await queue.markFailed(
    { id: failedId, attempts: 1 },
    { lastError: "again", status: "dead", retryAfterSeconds: 0 },
  );
  await step(
    "a failed or sent message is never claimed nor settled again",
    terminal.length === 0 && settleFailed.isSuccess && settleFailed.getValue() === false,
    ids(terminal),
  );
}

run(main, "queued emails are claimed by lease and settled per attempt");
