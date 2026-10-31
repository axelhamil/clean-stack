/**
 * Proves against a real Postgres and the real route stack what mocks cannot: a requeued dead
 * outbox row is picked up by the real claim and delivered, a dead row under a live lease is
 * left alone, a sweep writes its heartbeat and a dry run does not, and a Stripe event goes
 * through the real signed webhook handler both on first delivery and on replay, with a
 * refused replay rolled back. Creates and removes its own rows.
 */

import "./check-admin-ops.env";
import { uuidv7 } from "@packages/ddd-kit";
import {
  billingSchema,
  db,
  eq,
  inArray,
  like,
  or,
  outboxSchema,
  sql,
  sweepSchema,
} from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { Hono } from "hono";
import type Stripe from "stripe";
import { auth } from "../src/auth";
import { di } from "../src/container";
import { StripeReplayService } from "../src/modules/admin/application/services/stripe-replay.service";
import { StripeEventGateway } from "../src/modules/billing/infrastructure/adapters/stripe-event.gateway";
import { stripeClient } from "../src/modules/billing/infrastructure/stripe-client";
import { env } from "../src/shared/env";
import { sweepStripeEventsRoutes } from "../src/shared/internal-routes/sweep-stripe-events.route";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";
import { adminProbes, appCall } from "./admin-probes";
import { checkRecorder, internalApp, signedInternalRequest } from "./check-harness";
import { requireLocalDatabase } from "./require-local-database";

requireLocalDatabase("check-admin-ops");

const RUN = crypto.randomUUID();
const PROBE_TYPE = `check.admin-ops.${RUN}`;
const PROBE_AGGREGATE = `check-admin-ops-${RUN}`;
const STRIPE_PREFIX = `evt_check_${RUN}`;
const SUBSCRIPTION = `sub_check_${RUN}`;
const REFERENCE = `org_check_${RUN}`;
const SWEEP_LABEL = "sweep-stripe-events";
const DAY_MS = 24 * 60 * 60 * 1000;

const oe = outboxSchema.outboxEvent;
const { stripeEvent } = billingSchema;
const { sweepRun } = sweepSchema;

const probes = adminProbes(`check-admin-ops-${RUN}`);
const checks = checkRecorder();
const { check } = checks;

async function cleanup(): Promise<void> {
  await db
    .delete(oe)
    .where(
      or(
        eq(oe.eventType, PROBE_TYPE),
        eq(oe.aggregateId, PROBE_AGGREGATE),
        eq(oe.aggregateId, SUBSCRIPTION),
        like(oe.aggregateId, `${STRIPE_PREFIX}%`),
      ),
    );
  await db.delete(stripeEvent).where(like(stripeEvent.id, `${STRIPE_PREFIX}%`));
  await db.delete(sweepRun).where(eq(sweepRun.label, SWEEP_LABEL));
  await probes.cleanup();
}

async function seedOutbox(overrides: Partial<typeof oe.$inferInsert>): Promise<string> {
  const id = uuidv7();
  await db.insert(oe).values({
    id,
    eventType: PROBE_TYPE,
    aggregateId: PROBE_AGGREGATE,
    aggregateType: "probe",
    payload: {},
    metadata: {
      specversion: "1.0",
      source: "check/admin-ops",
      datacontenttype: "application/json",
    },
    occurredAt: new Date(Date.now() - DAY_MS),
    attempts: 5,
    ...overrides,
  });

  return id;
}

async function outboxRow(id: string) {
  const [row] = await db.select().from(oe).where(eq(oe.id, id));
  if (!row) throw new Error(`no outbox row ${id}`);

  return row;
}

async function confirmedManager(name: string): Promise<string> {
  const { cookie, unconfirmedRefusal } = await probes.confirmedManager(name, (unconfirmed) =>
    appCall(unconfirmed, "POST", "/admin/ops/outbox/requeue", { ids: ["x"] }),
  );
  check(
    "a requeue without a step-up is refused",
    unconfirmedRefusal === "ADMIN_REAUTH_REQUIRED",
    unconfirmedRefusal,
  );

  return cookie;
}

async function proveRequeueThenRedelivery(cookie: string): Promise<void> {
  const lastError = "handler: boom";
  const dead = await seedOutbox({
    deadAt: new Date(Date.now() - DAY_MS),
    lastError,
    nextAttemptAt: new Date(Date.now() + DAY_MS),
  });
  const leased = await seedOutbox({
    deadAt: new Date(Date.now() - DAY_MS),
    nextAttemptAt: new Date(Date.now() + 60_000),
  });
  const live = await seedOutbox({ attempts: 1, nextAttemptAt: new Date(Date.now() + DAY_MS) });

  const listed = await appCall(cookie, "GET", "/admin/ops/dead-letters");
  check(
    "the dead list holds the dead rows and not the live one",
    listed.response.status === 200 &&
      JSON.stringify(listed.body).includes(dead) &&
      !JSON.stringify(listed.body).includes(live),
  );

  const before = await outboxRow(dead);
  const beforeLeased = await outboxRow(leased);
  const requeued = await appCall(cookie, "POST", "/admin/ops/outbox/requeue", {
    ids: [dead, leased, live],
  });
  check("the requeue answers the one row it moved", requeued.status === 200, requeued.body);
  check(
    "only the waiting dead row moved",
    JSON.stringify(requeued.body) === JSON.stringify({ requeued: 1 }),
    requeued.body,
  );

  const after = await outboxRow(dead);
  const afterLeased = await outboxRow(leased);
  const afterLive = await outboxRow(live);
  check("a requeue never touches attempts", after.attempts === before.attempts, after.attempts);
  check(
    "a dead row under a live lease keeps its lease",
    afterLeased.nextAttemptAt?.getTime() === beforeLeased.nextAttemptAt?.getTime(),
  );
  check("a live row is not requeued", afterLive.deadAt === null && afterLive.attempts === 1);

  const announced = await db
    .select({ payload: oe.payload })
    .from(oe)
    .where(
      sql`${oe.eventType} = ${EventTypes.ADMIN_OPS_OUTBOX_REQUEUED} AND ${oe.aggregateId} = ${dead}`,
    );
  check("one event for the staff action", announced.length === 1, announced);
  await db.delete(oe).where(inArray(oe.aggregateId, [dead]));

  const claimed = await di.IOutboxRepository.claim({
    limit: 10,
    eventTypes: [PROBE_TYPE],
    leaseSeconds: 60,
  });
  const rows = claimed.getValue();
  check(
    "the real claim picks up the requeued row and nothing else",
    rows.length === 1 && rows[0]?.id === dead,
    rows.map((row) => row.id),
  );

  const [row] = rows;
  if (!row) throw new Error("nothing claimed");

  const delivered = await di.IOutboxRepository.markDelivered(row, { probe: "ok" });
  const settled = await outboxRow(dead);
  check(
    "the requeued row is delivered",
    delivered.getValue() === true && settled.dispatchedAt !== null && settled.deadAt === null,
  );

  const again = await appCall(cookie, "POST", "/admin/ops/outbox/requeue", { ids: [dead] });
  check(
    "a delivered row moves nothing and announces nothing",
    JSON.stringify(again.body) === JSON.stringify({ requeued: 0 }),
    again.body,
  );
}

async function proveSweepHeartbeat(): Promise<void> {
  const old = `${STRIPE_PREFIX}_old`;
  const recent = `${STRIPE_PREFIX}_recent`;
  await db.insert(stripeEvent).values([
    {
      id: old,
      type: "invoice.paid",
      status: "received",
      receivedAt: new Date(Date.now() - (env.STRIPE_EVENT_RETENTION_DAYS + 1) * DAY_MS),
    },
    { id: recent, type: "invoice.paid", status: "received" },
  ]);
  await db.delete(sweepRun).where(eq(sweepRun.label, SWEEP_LABEL));

  const app = internalApp(new Hono().route("/", sweepStripeEventsRoutes));
  const dry = await signedInternalRequest(app, "/internal/sweep-stripe-events", { dryRun: true });
  const afterDry = await db.select().from(sweepRun).where(eq(sweepRun.label, SWEEP_LABEL));
  check("a dry run writes no heartbeat", dry.status === 200 && afterDry.length === 0, dry.status);

  const swept = await signedInternalRequest(app, "/internal/sweep-stripe-events", {});
  const [run] = await db.select().from(sweepRun).where(eq(sweepRun.label, SWEEP_LABEL));
  check("the sweep answers", swept.status === 200, swept.status);
  check("the sweep wrote its heartbeat", run?.outcome === "ok" && (run?.count ?? 0) >= 1, run);
  check(
    "the heartbeat holds start, end and duration",
    run !== undefined && run.finishedAt >= run.startedAt && run.durationMs >= 0,
  );

  const left = await db
    .select({ id: stripeEvent.id })
    .from(stripeEvent)
    .where(inArray(stripeEvent.id, [old, recent]));
  check("retention removes the aged row only", left.length === 1 && left[0]?.id === recent, left);

  const second = await signedInternalRequest(app, "/internal/sweep-stripe-events", {});
  const rows = await db.select().from(sweepRun).where(eq(sweepRun.label, SWEEP_LABEL));
  check("one row per label", second.status === 200 && rows.length === 1, rows.length);
}

function failedInvoice(id: string, status: string): Stripe.Invoice {
  const invoice = {
    id: `in_${id}`,
    object: "invoice",
    status,
    parent: {
      subscription_details: {
        metadata: { referenceId: REFERENCE },
        subscription: SUBSCRIPTION,
      },
    },
  };

  return JSON.parse(JSON.stringify(invoice));
}

function invoiceFailed(id: string): Stripe.Event {
  const event = {
    id,
    object: "event",
    type: "invoice.payment_failed",
    data: { object: failedInvoice(id, "open") },
  };

  return JSON.parse(JSON.stringify(event));
}

async function paymentFailedCount(): Promise<number> {
  const rows = await db
    .select({ id: oe.id })
    .from(oe)
    .where(
      sql`${oe.eventType} = ${EventTypes.BILLING_PAYMENT_FAILED} AND ${oe.aggregateId} = ${SUBSCRIPTION}`,
    );

  return rows.length;
}

async function replayOutcomes(id: string): Promise<unknown[]> {
  const rows = await db
    .select({ payload: oe.payload })
    .from(oe)
    .where(
      sql`${oe.eventType} = ${EventTypes.ADMIN_OPS_STRIPE_EVENT_REPLAYED} AND ${oe.aggregateId} = ${id}`,
    );

  return rows.map(({ payload }) =>
    typeof payload === "object" && payload !== null && "outcome" in payload
      ? payload.outcome
      : undefined,
  );
}

function replayOver(id: string, invoiceStatus = "open"): StripeReplayService {
  const gateway = new StripeEventGateway(
    {
      events: { retrieve: async () => invoiceFailed(id) },
      subscriptions: { retrieve: () => Promise.reject(new Error("not a subscription event")) },
      invoices: { retrieve: async () => failedInvoice(id, invoiceStatus) },
      webhooks: stripeClient.webhooks,
    },
    { secretKey: "sk_test_check_admin_ops", webhookSecret: env.STRIPE_WEBHOOK_SECRET },
    new NoOpInstrumentation(),
  );

  return new StripeReplayService(
    di.IStripeEventStore,
    gateway,
    di.IOutboxRepository,
    di.ITransactionService,
  );
}

async function proveStripeReplay(actorUserId: string): Promise<void> {
  const id = `${STRIPE_PREFIX}_replay`;
  const payload = JSON.stringify(invoiceFailed(id));
  const first = await auth.handler(
    new Request("http://localhost/api/auth/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": await stripeClient.webhooks.generateTestHeaderStringAsync({
          payload,
          secret: env.STRIPE_WEBHOOK_SECRET ?? "",
        }),
      },
      body: payload,
    }),
  );
  const [received] = await db.select().from(stripeEvent).where(eq(stripeEvent.id, id));
  check("a signed webhook is accepted", first.status === 200, first.status);
  check("the plugin records the received event", received?.status === "received", received);
  check("the first delivery emits its event", (await paymentFailedCount()) === 1);

  const refused = await replayOver(id).replay({
    actorUserId,
    stripeEventId: id,
    handler: async () => new Response(null, { status: 400 }),
  });
  const [afterRefusal] = await db.select().from(stripeEvent).where(eq(stripeEvent.id, id));
  check("a refused replay fails", refused.isFailure);
  check("a refused replay is announced as failed", (await replayOutcomes(id)).join() === "failed");
  check(
    "a refused replay leaves replayed_at empty, stores why and frees the claim",
    afterRefusal?.replayedAt === null &&
      afterRefusal.status === "failed" &&
      afterRefusal.lastError !== null &&
      afterRefusal.replayClaimedAt === null,
    afterRefusal,
  );

  const [replayed, doubleClick] = await Promise.all([
    replayOver(id).replay({
      actorUserId,
      stripeEventId: id,
      handler: (request) => auth.handler(request),
    }),
    replayOver(id).replay({
      actorUserId,
      stripeEventId: id,
      handler: (request) => auth.handler(request),
    }),
  ]);
  const passed = [replayed, doubleClick].filter((result) => result.isSuccess);
  const conflicts = [replayed, doubleClick].filter(
    (result) => result.isFailure && result.getError().code === "ADMIN_STRIPE_REPLAY_CONFLICT",
  );
  check(
    "two replays at once make one replay and one typed conflict",
    passed.length === 1 && conflicts.length === 1,
  );

  const [after] = await db.select().from(stripeEvent).where(eq(stripeEvent.id, id));
  check(
    "the replay marks the row and clears the failure",
    after?.replayedAt !== null && after?.status === "received" && after?.lastError === null,
    after,
  );
  check(
    "the replay is announced once",
    (await replayOutcomes(id)).sort().join() === "failed,succeeded",
  );
  check("a replay announces nothing twice", (await paymentFailedCount()) === 1);

  const paidId = `${STRIPE_PREFIX}_paid`;
  await db.insert(stripeEvent).values({
    id: paidId,
    type: "invoice.payment_failed",
    status: "failed",
  });
  const paid = await replayOver(paidId, "paid").replay({
    actorUserId,
    stripeEventId: paidId,
    handler: (request) => auth.handler(request),
  });
  check("an invoice paid since then replays fine", paid.isSuccess, paid);
  check("an invoice paid since then announces no failure", (await paymentFailedCount()) === 1);

  const unknown = await replayOver(id).replay({
    actorUserId,
    stripeEventId: `${STRIPE_PREFIX}_unknown`,
    handler: (request) => auth.handler(request),
  });
  check(
    "an event not on record is refused",
    unknown.isFailure && unknown.getError().code === "ADMIN_STRIPE_EVENT_NOT_FOUND",
  );
}

async function main(): Promise<void> {
  const cookie = await confirmedManager("manager");
  const managerId = `check-admin-ops-${RUN}-manager`;

  await proveRequeueThenRedelivery(cookie);
  await proveSweepHeartbeat();
  await proveStripeReplay(managerId);
  await cleanup();

  if (checks.failures > 0) {
    console.error(`\n${checks.failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed, operations hold on the real stack.");
  process.exit(0);
}

main().catch(async (err) => {
  console.error("check-admin-ops crashed:", err);
  await cleanup().catch(() => {});
  process.exit(1);
});
