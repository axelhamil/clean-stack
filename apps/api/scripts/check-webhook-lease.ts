import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-webhook-lease");

import { Option, uuidv7 } from "@packages/ddd-kit";
import {
  db,
  eq,
  multiTenantSchema,
  outboxSchema,
  TransactionService,
  webhooksSchema,
} from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import type {
  DeliveryClaimRequest,
  DeliveryFailure,
  WebhookDeliveryRecord,
} from "../src/modules/webhooks/application/ports/webhook-delivery.port";
import { DrizzleWebhookDeliveryRepository } from "../src/modules/webhooks/infrastructure/repositories/drizzle-webhook-delivery.repository";
import { WebhookFanoutSubscriber } from "../src/shared/services/webhook-fanout-subscriber";
import { checkRun, probeClaims, recordingInstrumentation, withClockAhead } from "./check-harness";

const PROBE = `check-webhook-lease-${crypto.randomUUID()}`;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const { instrumentation, spans } = recordingInstrumentation();
const repository = new DrizzleWebhookDeliveryRepository(instrumentation);
const wd = webhooksSchema.webhookDelivery;
const we = webhooksSchema.webhookEndpoint;
const org = multiTenantSchema.organization;
const oe = outboxSchema.outboxEvent;

const organizationId = `${PROBE}-org`;
const endpointId = `${PROBE}-endpoint`;
const outboxEventId = `${PROBE}-event`;

async function cleanup(): Promise<void> {
  await db.delete(org).where(eq(org.id, organizationId));
  await db.delete(oe).where(eq(oe.id, outboxEventId));
}

async function seedTenant(): Promise<void> {
  await db.insert(org).values({ id: organizationId, name: PROBE, slug: PROBE });
  await db.insert(we).values({
    id: endpointId,
    organizationId,
    url: "https://check-webhook-lease.invalid/hook",
    secretCipher: "unused",
  });
  await db.insert(oe).values({
    id: outboxEventId,
    eventType: "check.webhook.lease",
    aggregateId: PROBE,
    aggregateType: "check",
    organizationId,
    payload: {},
    metadata: {
      specversion: "1.0",
      source: "check-webhook-lease",
      requestId: PROBE,
      datacontenttype: "application/json",
    },
    occurredAt: new Date(),
    dispatchedAt: new Date(),
  });
}

async function clearDeliveries(): Promise<void> {
  await db.delete(wd).where(eq(wd.endpointId, endpointId));
}

const { step, fail, run } = checkRun("check-webhook-lease", cleanup);

async function seed(
  count: number,
  overrides: Partial<typeof wd.$inferInsert> = {},
): Promise<string[]> {
  const base = Date.now() - 60_000;
  const rows = Array.from({ length: count }, (_, index) => ({
    id: uuidv7(),
    endpointId,
    outboxEventId,
    eventType: "check.webhook.lease",
    payload: {},
    status: "pending" as const,
    idempotencyKey: `${PROBE}-${uuidv7()}`,
    createdAt: new Date(base + index),
    ...overrides,
  }));
  await db.insert(wd).values(rows);

  return rows.map((row) => row.id);
}

const isProbe = (record: WebhookDeliveryRecord) => record.endpointId === endpointId;

const claims = probeClaims({
  claim: (request: Partial<DeliveryClaimRequest>) =>
    repository.claim({ limit: 50, leaseSeconds: 330, ...request }),
  release: async (foreign: WebhookDeliveryRecord[]) => {
    for (const delivery of foreign) await repository.release(delivery);
  },
  isProbe,
  fail,
});
const claimedAll = (request: Partial<DeliveryClaimRequest> = {}) => claims.all(request);
const claimed = (request: Partial<DeliveryClaimRequest> = {}) => claims.probes(request);

async function rowOf(id: string) {
  const [row] = await db.select().from(wd).where(eq(wd.id, id));
  if (!row) return fail(`row ${id} exists`);

  return row;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const ids = (records: WebhookDeliveryRecord[]) => records.map((record) => record.id);
const retryIn = (seconds: number, status: DeliveryFailure["status"]): DeliveryFailure => ({
  lastError: "HTTP 503",
  lastResponseStatus: Option.some(503),
  status,
  retryAfterSeconds: Option.some(seconds),
});
const terminal: DeliveryFailure = {
  lastError: "endpoint not found or disabled",
  lastResponseStatus: Option.none(),
  status: "dead_letter",
  retryAfterSeconds: Option.none(),
};

async function main(): Promise<void> {
  await cleanup();
  await seedTenant();

  await claimed({ limit: 1 });
  const claimSql = spans.find((name) => name.includes('from "due"')) ?? "";
  await step(
    "the claim locks both CTEs with for update skip locked and settles them in one update",
    claimSql.match(/for update skip locked/g)?.length === 2 &&
      claimSql.includes("union all") &&
      /update "webhook_delivery" set .* from "due"/.test(claimSql),
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

  await clearDeliveries();
  const [leasedId = ""] = await seed(1, { status: "failed", attempts: 2 });
  const leased = await claimed({ leaseSeconds: 1 });
  const hidden = await claimed();
  await pause(1_500);
  const reclaimed = await claimed();
  await step(
    "a claimed delivery is invisible until its lease expires, then claimable with attempts + 1",
    ids(leased).join() === leasedId &&
      hidden.length === 0 &&
      ids(reclaimed).join() === leasedId &&
      leased[0]?.attempts === 3 &&
      leased[0]?.status === "failed" &&
      reclaimed[0]?.attempts === 4,
    { leased: leased[0]?.attempts, hidden: hidden.length, reclaimed: reclaimed[0]?.attempts },
  );

  const aheadClaim = await withClockAhead(DAY_MS, () => claimed());
  await step(
    "the lease is read on the database clock: a process clock a day ahead claims nothing",
    aheadClaim.length === 0,
    ids(aheadClaim),
  );

  const stale = { id: leasedId, attempts: 3 };
  const staleSuccess = await repository.markSuccess(stale, Option.some(200));
  const staleFailed = await repository.markFailed(stale, terminal);
  const staleRelease = await repository.release(stale);
  const afterStale = await rowOf(leasedId);
  await step(
    "markSuccess, markFailed and release with a stale attempts value write nothing and say so",
    staleSuccess.isSuccess &&
      staleSuccess.getValue() === false &&
      staleFailed.isSuccess &&
      staleFailed.getValue() === false &&
      staleRelease.isSuccess &&
      staleRelease.getValue() === false &&
      afterStale.status === "failed" &&
      afterStale.attempts === 4,
    afterStale,
  );

  const retried = await repository.markFailed(
    { id: leasedId, attempts: 4 },
    retryIn(3_600, "failed"),
  );
  const afterRetry = await rowOf(leasedId);
  const notDue = await claimed();
  await step(
    "markFailed on the current lease schedules the retry on the database clock",
    retried.isSuccess &&
      retried.getValue() === true &&
      afterRetry.status === "failed" &&
      afterRetry.attempts === 4 &&
      afterRetry.lastResponseStatus === 503 &&
      (afterRetry.nextAttemptAt?.getTime() ?? 0) > Date.now() + HOUR_MS - 60_000 &&
      notDue.length === 0,
    afterRetry,
  );

  await clearDeliveries();
  const [deadId = ""] = await seed(1, {
    status: "dead_letter",
    attempts: 5,
    nextAttemptAt: new Date(Date.now() + HOUR_MS),
  });
  const deadNotYet = await claimed();
  await db
    .update(wd)
    .set({ nextAttemptAt: new Date(Date.now() - 1_000) })
    .where(eq(wd.id, deadId));
  const [replayed] = await claimed();
  await step(
    "a replayable dead_letter is claimed only when due, and claiming keeps it dead_letter",
    deadNotYet.length === 0 &&
      replayed?.id === deadId &&
      replayed.status === "dead_letter" &&
      replayed.attempts === 6,
    { notYet: deadNotYet.length, replayed: replayed?.status, attempts: replayed?.attempts },
  );
  const replaySuccess = await repository.markSuccess({ id: deadId, attempts: 6 }, Option.some(204));
  const afterReplay = await rowOf(deadId);
  await step(
    "a delivered dead replay lands success with no next attempt",
    replaySuccess.isSuccess &&
      replaySuccess.getValue() === true &&
      afterReplay.status === "success" &&
      afterReplay.nextAttemptAt === null &&
      afterReplay.lastResponseStatus === 204,
    afterReplay,
  );

  await clearDeliveries();
  const [terminalId = ""] = await seed(1, { attempts: 1 });
  const [toTerminal] = await claimed();
  const settledTerminal = await repository.markFailed(
    { id: terminalId, attempts: toTerminal?.attempts ?? -1 },
    terminal,
  );
  const afterTerminal = await rowOf(terminalId);
  await seed(1, { status: "dead_letter", attempts: 3, nextAttemptAt: null });
  await seed(1, { status: "success", attempts: 1, nextAttemptAt: null });
  const neverClaimed = await claimed();
  const settleAgain = await repository.markFailed({ id: terminalId, attempts: 2 }, terminal);
  await step(
    "a terminal dead_letter (no next attempt) or a success is never claimed nor settled again",
    settledTerminal.isSuccess &&
      settledTerminal.getValue() === true &&
      afterTerminal.status === "dead_letter" &&
      afterTerminal.nextAttemptAt === null &&
      neverClaimed.length === 0 &&
      settleAgain.isSuccess &&
      settleAgain.getValue() === false,
    { afterTerminal, claimed: ids(neverClaimed) },
  );

  await clearDeliveries();
  await seed(8, { status: "dead_letter", nextAttemptAt: new Date(Date.now() - HOUR_MS) });
  await seed(8);
  const mixed = await claimedAll({ limit: 8 });
  const deadShare = mixed.filter((record) => record.status === "dead_letter").length;
  await step(
    "dead replays take at most a quarter of a claim so live deliveries are never starved",
    mixed.length === 8 && deadShare === 2,
    { claimed: mixed.length, dead: deadShare },
  );

  await clearDeliveries();
  const [releasedId = ""] = await seed(1, { status: "failed", attempts: 3 });
  const [toRelease] = await claimed();
  const released = await repository.release({
    id: releasedId,
    attempts: toRelease?.attempts ?? -1,
  });
  const afterRelease = await rowOf(releasedId);
  const [reclaimedAfterRelease] = await claimed();
  await step(
    "release gives the attempt back and makes the delivery claimable at once",
    toRelease?.attempts === 4 &&
      released.isSuccess &&
      released.getValue() === true &&
      afterRelease.attempts === 3 &&
      afterRelease.status === "failed" &&
      reclaimedAfterRelease?.attempts === 4,
    { afterRelease, reclaimed: reclaimedAfterRelease?.attempts },
  );

  await clearDeliveries();
  const [originalId = ""] = await seed(1, {
    status: "dead_letter",
    attempts: 5,
    nextAttemptAt: null,
  });
  const replay = await withClockAhead(DAY_MS, () =>
    repository.enqueueReplay(originalId, endpointId, organizationId),
  );
  const replayId = replay.isSuccess
    ? replay
        .getValue()
        .map((record) => record.id)
        .toNull()
    : null;
  const [claimedReplay] = await claimed();
  await step(
    "enqueueReplay creates a pending delivery due on the database clock, claimed at once",
    replayId !== null &&
      claimedReplay?.id === replayId &&
      claimedReplay.status === "pending" &&
      claimedReplay.attempts === 1 &&
      claimedReplay.idempotencyKey.startsWith("replay:"),
    { replayId, claimed: claimedReplay?.id },
  );
  await clearDeliveries();
  await db
    .update(we)
    .set({ eventTypes: ["*"] })
    .where(eq(we.id, endpointId));
  const fanout = new WebhookFanoutSubscriber(
    new TransactionService(instrumentation),
    instrumentation,
  );
  await withClockAhead(DAY_MS, () =>
    fanout.handle({
      eventId: outboxEventId,
      eventType: EventTypes.USER_CREATED,
      aggregateId: PROBE,
      aggregateType: "check",
      organizationId,
      dateOccurred: new Date(),
      payload: {},
    }),
  );
  const [fannedOut] = await claimed();
  await step(
    "a fanned-out delivery is due on the database clock even when the process clock runs ahead",
    fannedOut?.outboxEventId === outboxEventId &&
      fannedOut.status === "pending" &&
      fannedOut.attempts === 1,
    { claimed: fannedOut?.id },
  );
}

run(main, "webhook deliveries are claimed by lease and settled per attempt");
