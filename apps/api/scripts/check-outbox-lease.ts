/**
 * Proves against a real Postgres that the outbox lease holds: concurrent claims never
 * share a row, a claimed row stays hidden until its lease expires, a settle with a
 * stale attempt count writes nothing, deliveries merge instead of overwriting, a dead
 * row is replayed only once due, a type outside the list is never claimed, and an
 * enqueue rolled back with its run leaves neither a row nor a notification, a
 * redelivered audit-log handler appends a single link to the hash chain, and the
 * retention purge removes delivered rows past the cutoff but never a dead one.
 *
 * Every one of these lives in the claim CTE, the settle WHERE or the transaction,
 * which a mocked executor never evaluates.
 */

import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-outbox-lease");

import { Result, uuidv7 } from "@packages/ddd-kit";
import {
  and,
  auditLogSchema,
  db,
  eq,
  like,
  or,
  outboxSchema,
  TransactionService,
} from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { Client } from "pg";
import { emitEvent } from "../src/shared/event-emitter";
import { buildPurgeFilter } from "../src/shared/internal-routes/sweep-outbox.route";
import { purgeBatchWithTimeout, requireFilter } from "../src/shared/internal-routes/sweep-purge";
import { sweepSpans } from "../src/shared/internal-routes/sweep-span";
import type { OutboxRecord } from "../src/shared/ports/outbox.port";
import { AuditEventSubscriber } from "../src/shared/services/audit-event-subscriber";
import {
  DrizzleOutboxRepository,
  OUTBOX_CHANNEL,
} from "../src/shared/services/drizzle-outbox.service";
import { checkRun, recordingInstrumentation } from "./check-harness";

const PROBE = `check.outbox-lease.${crypto.randomUUID()}`;
const TYPE_A = `${PROBE}.a`;
const TYPE_B = `${PROBE}.b`;
const AGGREGATE = `check-outbox-lease-${crypto.randomUUID()}`;

const { instrumentation, spans } = recordingInstrumentation();
const outbox = new DrizzleOutboxRepository(instrumentation);
const uow = new TransactionService(instrumentation, async (events) => {
  await outbox.enqueue(events, { source: "check/outbox-lease" });
});

const oe = outboxSchema.outboxEvent;
const al = auditLogSchema.auditLog;

async function cleanup(): Promise<void> {
  await db.delete(al).where(eq(al.targetId, AGGREGATE));
  await db.delete(oe).where(or(like(oe.eventType, `${PROBE}%`), eq(oe.aggregateId, AGGREGATE)));
}

const { step, fail, run } = checkRun("check-outbox-lease", cleanup);

async function seed(
  count: number,
  eventType: string,
  overrides: Partial<typeof oe.$inferInsert> = {},
): Promise<string[]> {
  const base = Date.now() - 60_000;
  const rows = Array.from({ length: count }, (_, index) => ({
    id: uuidv7(),
    eventType,
    aggregateId: AGGREGATE,
    aggregateType: "probe",
    payload: {},
    metadata: {
      specversion: "1.0" as const,
      source: "check/outbox-lease",
      datacontenttype: "application/json" as const,
    },
    occurredAt: new Date(base + index),
    ...overrides,
  }));
  await db.insert(oe).values(rows);

  return rows.map((row) => row.id);
}

async function claimed(eventTypes: string[], limit = 50, leaseSeconds = 120) {
  const result = await outbox.claim({ limit, eventTypes, leaseSeconds });
  if (result.isFailure) return fail("claim succeeds", result.getError());

  return result.getValue();
}

async function rowOf(id: string) {
  const [row] = await db.select().from(oe).where(eq(oe.id, id));
  if (!row) return fail(`row ${id} exists`);

  return row;
}

async function resetProbes(): Promise<void> {
  await db.delete(oe).where(like(oe.eventType, `${PROBE}%`));
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const ids = (records: OutboxRecord[]) => records.map((record) => record.id);

async function main(): Promise<void> {
  await cleanup();

  const probe = await claimed([TYPE_A], 1);
  const claimSql = spans.at(-1) ?? "";
  await step(
    "the claim locks both CTEs with for update skip locked and settles them in one update",
    probe.length === 0 &&
      claimSql.match(/for update skip locked/g)?.length === 2 &&
      claimSql.includes("union all") &&
      /update "outbox_event" set .* from "due"/.test(claimSql),
    claimSql,
  );

  const seeded = await seed(30, TYPE_A);
  const [first, second] = await Promise.all([claimed([TYPE_A], 20), claimed([TYPE_A], 20)]);
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

  await resetProbes();
  const [leasedId = ""] = await seed(1, TYPE_A);
  const leased = await claimed([TYPE_A], 10, 1);
  const hidden = await claimed([TYPE_A]);
  await pause(1_500);
  const reclaimed = await claimed([TYPE_A]);
  await step(
    "a claimed row is invisible until its lease expires, then claimable with attempts + 1",
    ids(leased).join() === leasedId &&
      hidden.length === 0 &&
      ids(reclaimed).join() === leasedId &&
      leased[0]?.attempts === 1 &&
      reclaimed[0]?.attempts === 2,
    { leased: leased.length, hidden: hidden.length, reclaimed: reclaimed[0]?.attempts },
  );

  const stale = await outbox.markDelivered({ id: leasedId, attempts: 1 }, { "audit-log": "x" });
  const staleFailure = await outbox.markFailed(
    { id: leasedId, attempts: 1 },
    { lastError: "stale", retryAfterSeconds: 0, dead: true, deliveries: {} },
  );
  const afterStale = await rowOf(leasedId);
  await step(
    "markDelivered with a stale attempts value writes nothing and says so",
    stale.isSuccess &&
      stale.getValue() === false &&
      afterStale.dispatchedAt === null &&
      Object.keys(afterStale.deliveries).length === 0,
    afterStale,
  );
  await step(
    "markFailed with a stale attempts value writes nothing and says so",
    staleFailure.isSuccess &&
      staleFailure.getValue() === false &&
      afterStale.deadAt === null &&
      afterStale.lastError !== "stale",
    afterStale,
  );

  const deliveredAt = new Date().toISOString();
  const written = await outbox.markFailed(
    { id: leasedId, attempts: 2 },
    {
      lastError: "webhook-fanout: boom",
      retryAfterSeconds: 0,
      dead: false,
      deliveries: { "audit-log": deliveredAt },
    },
  );
  await step(
    "markFailed on the current lease reports the row written",
    written.isSuccess && written.getValue() === true,
    written.isSuccess ? written.getValue() : written.getError(),
  );
  const [retried] = await claimed([TYPE_A]);
  await outbox.markFailed(
    { id: leasedId, attempts: retried?.attempts ?? -1 },
    {
      lastError: "webhook-fanout: boom again",
      retryAfterSeconds: 60,
      dead: false,
      deliveries: { "notification-fanout": deliveredAt },
    },
  );
  const merged = await rowOf(leasedId);
  await step(
    "markFailed merges deliveries without erasing earlier handlers",
    Object.keys(merged.deliveries).sort().join() === "audit-log,notification-fanout" &&
      merged.lastError === "webhook-fanout: boom again" &&
      merged.dispatchedAt === null,
    merged.deliveries,
  );

  await resetProbes();
  const [deadId = ""] = await seed(1, TYPE_A);
  const [doomed] = await claimed([TYPE_A]);
  await outbox.markFailed(
    { id: deadId, attempts: doomed?.attempts ?? -1 },
    { lastError: "audit-log: gone", retryAfterSeconds: 2, dead: true, deliveries: {} },
  );
  const dead = await rowOf(deadId);
  const notYet = await claimed([TYPE_A]);
  await pause(2_500);
  const [replayed] = await claimed([TYPE_A]);
  const revived = await rowOf(deadId);
  await step(
    "a dead row is claimed only when next_attempt_at is due, and claiming keeps it dead",
    dead.deadAt !== null &&
      notYet.length === 0 &&
      replayed?.id === deadId &&
      replayed.deadAt.isSome() &&
      replayed.attempts === 2 &&
      revived.deadAt?.getTime() === dead.deadAt.getTime(),
    { notYet: notYet.length, replayed: replayed?.id, deadAt: revived.deadAt },
  );
  const hiddenWhileLeased = await claimed([TYPE_A]);
  await step(
    "a leased dead replay is hidden from both CTEs until its lease expires",
    hiddenWhileLeased.length === 0,
    ids(hiddenWhileLeased),
  );
  const replayDelivered = await outbox.markDelivered(
    { id: deadId, attempts: replayed?.attempts ?? -1 },
    { "audit-log": new Date().toISOString() },
  );
  const settledReplay = await rowOf(deadId);
  await step(
    "a delivered dead replay clears dead_at",
    replayDelivered.isSuccess &&
      replayDelivered.getValue() === true &&
      settledReplay.deadAt === null &&
      settledReplay.dispatchedAt !== null,
    settledReplay,
  );

  await resetProbes();
  const [releasedId = ""] = await seed(1, TYPE_A, { attempts: 9 });
  const [toRelease] = await claimed([TYPE_A]);
  const staleRelease = await outbox.release({ id: releasedId, attempts: 9 });
  const released = await outbox.release({ id: releasedId, attempts: toRelease?.attempts ?? -1 });
  const afterRelease = await rowOf(releasedId);
  const [reclaimedAfterRelease] = await claimed([TYPE_A]);
  await step(
    "release gives the attempt back, never kills the row and makes it claimable at once",
    toRelease?.attempts === 10 &&
      staleRelease.isSuccess &&
      staleRelease.getValue() === false &&
      released.isSuccess &&
      released.getValue() === true &&
      afterRelease.attempts === 9 &&
      afterRelease.deadAt === null &&
      afterRelease.dispatchedAt === null &&
      reclaimedAfterRelease?.attempts === 10,
    { afterRelease, reclaimed: reclaimedAfterRelease?.attempts },
  );

  await resetProbes();
  await seed(8, TYPE_A, { deadAt: new Date(Date.now() - 3_600_000), nextAttemptAt: new Date(0) });
  await seed(8, TYPE_A);
  const mixed = await claimed([TYPE_A], 8);
  const deadShare = mixed.filter((record) => record.deadAt.isSome()).length;
  await step(
    "dead replays take at most a quarter of a claim so live rows are never starved",
    mixed.length === 8 && deadShare === 2,
    { claimed: mixed.length, dead: deadShare },
  );

  await resetProbes();
  await seed(2, TYPE_B);
  const outside = await claimed([TYPE_A]);
  await step("a row of a type outside the list is never claimed", outside.length === 0, outside);

  const listener = new Client({ connectionString: process.env.DATABASE_URL });
  const notifications: string[] = [];
  await listener.connect();
  listener.on("notification", (message) => {
    if (message.channel === OUTBOX_CHANNEL) notifications.push(message.payload ?? "");
  });
  await listener.query(`listen ${OUTBOX_CHANNEL}`);

  const emit = () =>
    emitEvent(outbox, EventTypes.USER_PROFILE_UPDATED, "user", AGGREGATE, {
      userId: AGGREGATE,
      changes: {},
    });
  const rolledBack = await uow.run(async () => {
    await emit();
    return Result.fail("rolled back on purpose");
  });
  await pause(300);
  const afterRollback = await db
    .select({ id: oe.id })
    .from(oe)
    .where(and(eq(oe.aggregateId, AGGREGATE), eq(oe.eventType, EventTypes.USER_PROFILE_UPDATED)));
  const silentAfterRollback = notifications.length;

  const committedId = await uow.run(async () => Result.ok(await emit()));
  await pause(300);
  await listener.end();
  if (committedId.isFailure) return fail("a committed run succeeds", committedId.getError());
  const committed = await rowOf(committedId.getValue());
  await step(
    "enqueue inside a rolled back run leaves no row and no notification",
    rolledBack.isFailure && afterRollback.length === 0 && silentAfterRollback === 0,
    { rows: afterRollback.length, notifications: silentAfterRollback },
  );
  await step(
    "enqueue inside a committed run stores the event id as row id and notifies at commit",
    committed.id === committedId.getValue() && notifications.length >= 1,
    { notifications: notifications.length },
  );

  const pending = await outbox.pendingState([TYPE_A, TYPE_B]);
  await step(
    "pendingState reports the oldest live row and a due delay",
    pending.isSuccess &&
      pending.getValue().dueInMs.isSome() &&
      pending.getValue().oldestPendingSeconds >= 59,
    pending.isSuccess
      ? { ...pending.getValue(), dueInMs: pending.getValue().dueInMs.toNull() }
      : pending.getError(),
  );

  const audit = new AuditEventSubscriber(uow, instrumentation, true);
  const audited = {
    eventId: uuidv7(),
    eventType: EventTypes.USER_PROFILE_UPDATED,
    aggregateId: AGGREGATE,
    aggregateType: "user",
    payload: { userId: AGGREGATE, changes: {} },
    dateOccurred: new Date(),
  };
  await Promise.all([audit.handle(audited), audit.handle(audited)]);
  await audit.handle(audited);
  const links = await db
    .select({ id: al.id, hash: al.hash, prevHash: al.prevHash })
    .from(al)
    .where(eq(al.targetId, AGGREGATE));
  const [link] = links;
  const [successor] = link?.hash
    ? await db.select({ id: al.id }).from(al).where(eq(al.prevHash, link.hash))
    : [];
  await step(
    "audit-log redelivery keeps a single chain link",
    links.length === 1 &&
      link?.id === `audit-${audited.eventId}` &&
      link.hash !== null &&
      successor === undefined,
    { links: links.length, successor: successor?.id },
  );

  await resetProbes();
  const cutoff = new Date(Date.now() - 24 * 3_600_000);
  const longAgo = new Date(cutoff.getTime() - 3_600_000);
  const [deliveredOld = ""] = await seed(1, TYPE_A, { dispatchedAt: longAgo });
  const [deliveredRecent = ""] = await seed(1, TYPE_A, { dispatchedAt: new Date() });
  const [deadOld = ""] = await seed(1, TYPE_A, {
    occurredAt: longAgo,
    deadAt: longAgo,
    attempts: 10,
  });
  const purged = await purgeBatchWithTimeout({
    table: oe,
    idColumn: oe.id,
    where: requireFilter(and(buildPurgeFilter(cutoff), like(oe.eventType, `${PROBE}%`)), PROBE),
    orderBy: oe.dispatchedAt,
    batchSize: 100,
    spans: sweepSpans(instrumentation),
    uow,
  });
  const kept = await db
    .select({ id: oe.id })
    .from(oe)
    .where(like(oe.eventType, `${PROBE}%`));
  const keptIds = kept.map((row) => row.id);
  await step(
    "retention keeps dead undelivered rows and removes delivered ones past the cutoff",
    purged === 1 &&
      !keptIds.includes(deliveredOld) &&
      keptIds.includes(deliveredRecent) &&
      keptIds.includes(deadOld),
    { purged, kept: keptIds.length },
  );
}

run(main, "outbox events are claimed by lease and settled per attempt");
