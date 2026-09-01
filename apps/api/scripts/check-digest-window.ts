// The frequency preference is resolved inside one `INSERT ... SELECT`, and the
// due filter inside one `SELECT ... FOR UPDATE SKIP LOCKED`. A mocked `tx`
// evaluates neither, so a green `bun test` around them would prove only that a
// method was called — which is exactly how the preference cascade shipped inert
// in the first place. This runs both against a real Postgres and measures what
// actually gets enqueued. See apps/api/src/shared/CLAUDE.md ("write an
// executable check against a real database and wire it to a script") and
// `check-fanout-preferences.ts` for the reference shape.
//
// Run: `pnpm --filter api check:digest` (needs `pnpm --filter api db:seed`).
// Re-run after any change to the fan-out's due-date branch, `digest-schedule.ts`
// or `flush-notification-emails.route.ts`.
//
// WARNING: writes real notification, preference and email_message rows for the
// seeded account, and takes the real `flush-notification-emails` lease. Local
// database only — `requireLocalDatabase` enforces it.

import { Writable } from "node:stream";
import { Option } from "@packages/ddd-kit";
import { authSchema, db, eq, sql } from "@packages/drizzle";
import { Hono } from "hono";
import { pinoLogger } from "hono-pino";
import { pino } from "pino";
import { env } from "../src/shared/env";
import { flushNotificationEmailsRoutes } from "../src/shared/internal-routes/flush-notification-emails.route";
import { canonicalize, sign } from "../src/shared/internal-routes/internal-signature";
import type { OutboxRecord } from "../src/shared/ports/outbox.port";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";
import { NotificationFanoutSubscriber } from "../src/shared/services/notification-fanout-subscriber";
import { requireLocalDatabase } from "./require-local-database";
import { seedEmail } from "./seed-account";

requireLocalDatabase("check-digest-window");

let failed = false;
function check(label: string, ok: boolean, extra?: unknown) {
  const suffix = extra === undefined ? "" : ` :: ${JSON.stringify(extra)}`;
  console.log(`${ok ? "  OK" : "  FAIL"}: ${label}${suffix}`);
  if (!ok) failed = true;
}

const email = seedEmail();
const [user] = await db
  .select({ id: authSchema.user.id })
  .from(authSchema.user)
  .where(eq(authSchema.user.email, email))
  .limit(1);
if (!user) {
  throw new Error(
    `no user for ${email} — run \`pnpm --filter api db:seed\` first, ` +
      "or point this check at another account with SEED_EMAIL.",
  );
}
const userId = user.id;

const DIGEST_HOUR_UTC = 8;
const subscriber = new NotificationFanoutSubscriber(new NoOpInstrumentation(), DIGEST_HOUR_UTC);

// Far enough in the future that nothing deferred is due by accident: the whole
// point of the check is that only what has been deliberately backdated flushes.
const OCCURRED_AT = new Date("2099-03-10T09:15:00.000Z");
const IMMEDIATE_DUE = "2099-03-10T09:15:00";
const HOURLY_DUE = "2099-03-10T10:00:00";
const DAILY_DUE = "2099-03-11T08:00:00";

const event = (n: number): OutboxRecord => ({
  id: `01J0000000000000000000${String(n).padStart(2, "0")}`,
  eventType: "user.export.completed",
  aggregateId: `digest-probe-${n}`,
  aggregateType: "user",
  organizationId: Option.none(),
  payload: { userId, expiresAt: "2099-04-01T00:00:00.000Z" },
  metadata: {} as OutboxRecord["metadata"],
  occurredAt: OCCURRED_AT,
  attempts: 0,
});

const forcedEvent = (): OutboxRecord => ({
  ...event(9),
  eventType: "user.password_changed",
  aggregateId: "digest-probe-forced",
});

const reset = async () => {
  await db.execute(sql`DELETE FROM notification WHERE user_id = ${userId}`);
  await db.execute(
    sql`DELETE FROM notification_preference WHERE scope = 'user' AND scope_id = ${userId}`,
  );
  await db.execute(sql`DELETE FROM email_message WHERE to_address = ${email}`);
  await db.execute(sql`DELETE FROM sweep_lock WHERE label = 'flush-notification-emails'`);
};

const setFrequency = (category: string, frequency: string) =>
  db.execute(sql`
    INSERT INTO notification_preference (id, scope, scope_id, category, channel, enabled, frequency, locked)
    VALUES (gen_random_uuid()::text, 'user', ${userId}, ${category}, 'email', true, ${frequency}, false)
    ON CONFLICT (scope, scope_id, category, channel)
    DO UPDATE SET frequency = ${frequency}, enabled = true`);

const setEmailEnabled = (category: string, enabled: boolean) =>
  db.execute(sql`
    INSERT INTO notification_preference (id, scope, scope_id, category, channel, enabled, frequency, locked)
    VALUES (gen_random_uuid()::text, 'user', ${userId}, ${category}, 'email', ${enabled}, 'immediate', false)
    ON CONFLICT (scope, scope_id, category, channel)
    DO UPDATE SET enabled = ${enabled}`);

const fanout = (e: OutboxRecord) => db.transaction(async (tx) => subscriber.handle(e, tx));

// Read the due column back as text. It is a tz-naive `timestamp` holding UTC, and
// letting the driver hydrate it into a JS `Date` would reinterpret it in the host's
// local zone — the comparison would then be testing this machine's offset.
const dueDates = async () => {
  const result = await db.execute(sql`
    SELECT event_type, email_pending_at::text AS due, email_sent_at
    FROM notification WHERE user_id = ${userId} ORDER BY created_at`);
  const rows = (result.rows ?? result) as {
    event_type: string;
    due: string | null;
    email_sent_at: Date | null;
  }[];
  return rows.map((r) => ({
    eventType: r.event_type,
    due: r.due === null ? null : r.due.replace(" ", "T").replace(/\.0+$/, ""),
    sent: r.email_sent_at !== null,
  }));
};

const enqueued = async () => {
  const result = await db.execute(sql`
    SELECT payload, idempotency_key FROM email_message
    WHERE to_address = ${email} ORDER BY created_at`);
  return (result.rows ?? result) as {
    payload: Record<string, string>;
    idempotency_key: string;
  }[];
};

function loggedApp() {
  const sink = new Writable({
    write(_chunk: Buffer, _encoding, callback) {
      callback();
    },
  });
  const app = new Hono();
  app.use("*", pinoLogger({ pino: pino(sink) }));
  app.route("/internal", flushNotificationEmailsRoutes as unknown as Hono);
  return app;
}

const app = loggedApp();
const path = "/internal/flush-notification-emails";

async function flush(
  options: { batchSize?: number } = {},
): Promise<{ flushed: number; notifications: number; skipped?: boolean }> {
  const key = env.INTERNAL_SIGNING_KEY;
  if (!key) throw new Error("INTERNAL_SIGNING_KEY is not set — cannot sign a request");
  const rawBody = JSON.stringify(
    options.batchSize === undefined ? {} : { batchSize: options.batchSize },
  );
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sign(
    canonicalize({
      timestamp,
      method: "POST",
      path,
      host: "localhost",
      contentType: "application/json",
      rawBody,
    }),
    key,
  );
  const res = await app.request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      host: "localhost",
      "X-Internal-Signature": `t=${timestamp},v1=${signature}`,
    },
    body: rawBody,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`flush failed: ${res.status} ${text}`);
  return JSON.parse(text);
}

/** Data-based time travel: brings every unsent due date into the past. */
const makeEverythingDue = () =>
  db.execute(sql`
    UPDATE notification SET email_pending_at = now() - interval '1 minute'
    WHERE user_id = ${userId} AND email_sent_at IS NULL`);

// ---------------------------------------------------------------------------
console.log("[1] the frequency preference decides the due date");
await reset();
await setFrequency("activity", "immediate");
await fanout(event(1));
await setFrequency("activity", "hourly");
await fanout(event(2));
await setFrequency("activity", "daily");
await fanout(event(3));
// Forced events join no preference row: nothing may defer them.
await setFrequency("security", "daily");
await fanout(forcedEvent());

const due = await dueDates();
check("4 notifications created", due.length === 4, due.length);
check("immediate → the instant the event occurred", due[0]?.due === IMMEDIATE_DUE, due[0]?.due);
check("hourly → the next full hour", due[1]?.due === HOURLY_DUE, due[1]?.due);
check("daily → the next 08:00 UTC anchor", due[2]?.due === DAILY_DUE, due[2]?.due);
check(
  "a forced event stays immediate despite a daily preference",
  due[3]?.due === IMMEDIATE_DUE,
  due[3]?.due,
);

// ---------------------------------------------------------------------------
console.log("[2] the flush sends only what has come due");
await db.execute(sql`
  UPDATE notification SET email_pending_at = now() - interval '1 minute'
  WHERE user_id = ${userId} AND email_pending_at = ${IMMEDIATE_DUE}::timestamp`);

const first = await flush();
const afterFirst = await enqueued();
check("one digest per (user, category) went out", first.flushed === 2, first);
check("two e-mails enqueued, one per category", afterFirst.length === 2, afterFirst.length);
check(
  "each carries a single item",
  afterFirst.every((e) => e.payload.itemCount === "1"),
  afterFirst.map((e) => e.payload.itemCount),
);
check("the deferred rows were not sent", (await dueDates()).filter((r) => !r.sent).length === 2);

// ---------------------------------------------------------------------------
console.log("[3] an empty window sends nothing");
const empty = await flush();
check("nothing due → no digest", empty.flushed === 0 && empty.notifications === 0, empty);
check("no extra e-mail", (await enqueued()).length === 2, (await enqueued()).length);

// ---------------------------------------------------------------------------
console.log("[4] a due window groups into one e-mail");
await setFrequency("activity", "daily");
await fanout(event(4));
await fanout(event(5));
const pendingDue = (await dueDates()).filter((r) => !r.sent).map((r) => r.due);
check(
  "the three daily rows share one due date, the hourly one keeps its own",
  pendingDue.filter((d) => d === DAILY_DUE).length === 3 &&
    pendingDue.filter((d) => d === HOURLY_DUE).length === 1,
  pendingDue,
);

await makeEverythingDue();
const grouped = await flush();
check("one digest for the 4 due notifications", grouped.flushed === 1, grouped);
check("it groups all 4", grouped.notifications === 4, grouped);
const afterGroup = await enqueued();
check("exactly one extra e-mail", afterGroup.length === 3, afterGroup.length);
check(
  "the digest carries 4 items",
  afterGroup[2]?.payload.itemCount === "4",
  afterGroup[2]?.payload,
);

// ---------------------------------------------------------------------------
console.log("[5] concurrent runs and replays do not double-send");
await setFrequency("activity", "daily");
await fanout(event(6));
await makeEverythingDue();
const [a, b] = await Promise.all([flush(), flush()]);
// The invariant is "one window, one digest" — not *how* the loser lost. A run
// that finds the lease held reports `skipped: true`; one that starts after the
// winner released reports `skipped: false, flushed: 0`. Both are correct, and
// which one happens is scheduling, not behaviour: asserting on `skipped` made
// this check fail on a slower runner while nothing was wrong. The lease's own
// contention semantics are covered by `check:sweep-lock`, against the same
// table; what belongs here is that the second run sent nothing.
check(
  "exactly one of the two runs did the work, and the other sent nothing",
  [a, b].filter((r) => r.flushed === 1).length === 1 &&
    [a, b].filter((r) => r.flushed === 0 && r.notifications === 0).length === 1,
  [a, b],
);
check("exactly one extra e-mail", (await enqueued()).length === 4);
check("a replay sends nothing", (await flush()).flushed === 0);
check(
  "each digest carries its own idempotency key",
  new Set((await enqueued()).map((e) => e.idempotency_key)).size === 4,
);

await reset();

// ---------------------------------------------------------------------------
console.log("[6] a preference disabled after scheduling cancels the digest at send time");
await reset();
await setFrequency("activity", "daily");
await fanout(event(7));
await setEmailEnabled("activity", false);
await makeEverythingDue();
const beforeDrop = await dueDates();
check(
  "the row is still pending right before the flush",
  beforeDrop.some((r) => r.eventType === "user.export.completed" && !r.sent),
  beforeDrop,
);
const droppedRun = await flush();
check(
  "nothing was sent — the preference was flipped off after scheduling",
  droppedRun.flushed === 0 && droppedRun.notifications === 0,
  droppedRun,
);
const afterDrop = await dueDates();
check(
  "the dropped row's email_pending_at was cleared, not left eligible forever",
  afterDrop.length === 1 && afterDrop[0]?.due === null,
  afterDrop,
);
check("no e-mail was enqueued for the dropped row", (await enqueued()).length === 0);

// ---------------------------------------------------------------------------
console.log("[7] a forced digest still sends despite the category's email being disabled");
await reset();
await setEmailEnabled("security", false);
await fanout(forcedEvent());
await makeEverythingDue();
const forcedRun = await flush();
check(
  "the forced digest went out — forced notifications join no preference at the flush either",
  forcedRun.flushed === 1 && forcedRun.notifications === 1,
  forcedRun,
);

// ---------------------------------------------------------------------------
console.log("[8] a backlog bigger than batchSize still becomes one digest, not one per page");
await reset();
await setFrequency("activity", "daily");
for (let i = 10; i < 15; i++) await fanout(event(i));
await makeEverythingDue();
const paged = await flush({ batchSize: 2 }); // 5 due rows, pages of 2 → 3 pages
check(
  "one digest covers all 5 rows across 3 pages, not 3 separate digests",
  paged.flushed === 1 && paged.notifications === 5,
  paged,
);
check(
  "exactly one e-mail, not one per page",
  (await enqueued()).length === 1,
  (await enqueued()).length,
);
const lastDigest = (await enqueued()).at(-1);
check("the single digest carries all 5 items", lastDigest?.payload.itemCount === "5", lastDigest);
const summaryTerms = (lastDigest?.payload.itemsSummary ?? "").split(", ").filter(Boolean);
check(
  "each of the 5 rows contributed exactly one item — no row seen twice across pages",
  summaryTerms.length === 5,
  summaryTerms,
);
const afterPaged = await dueDates();
check(
  "every row across all 3 pages was marked sent, none left pending",
  afterPaged.length === 5 && afterPaged.every((r) => r.sent),
  afterPaged,
);
const pagedReplay = await flush({ batchSize: 2 });
check(
  "a replay of the same paged window sends nothing — no row was left re-selectable",
  pagedReplay.flushed === 0 && pagedReplay.notifications === 0,
  pagedReplay,
);

await reset();

if (failed) {
  console.error("check:digest FAILED");
  process.exit(1);
}
console.log("check:digest OK");
process.exit(0);
