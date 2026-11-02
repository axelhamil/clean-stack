# Event pipeline, how it works

A visual walkthrough of the transactional outbox + LISTEN/NOTIFY pipeline. For
the DX guide (how to declare events, register handlers, retention map), see
[EVENTS.md](./EVENTS.md).

## The problem this solves

You write business code that changes state in Postgres, and you also want
*something else* to happen as a consequence, an audit row, a webhook to a
customer, an email, a search-index sync. The naive "save then send" has a
hidden flaw: the two writes belong to different systems, and any failure
between them leaves you inconsistent.

| Scenario | Naive code | What goes wrong |
|---|---|---|
| Broker down | `db.save(); broker.send()` | Row saved, event lost. Silent. |
| Crash mid-flight | `db.save(); broker.send()` | Same: state moved, observers blind. |
| TX rolls back after send | `broker.send(); db.save()` | Event sent for a state that never existed. |

This is the **dual-write problem**, and the *transactional outbox* is the
canonical fix: write the event into the same database, inside the same
transaction, then have a separate process relay it. One commit, two writes,
zero divergence.

## The full flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 1  ·  inside the business transaction                        │
│                                                                      │
│   your use case ──►  uow.run(async () => {                          │
│                         aggregate.addEvent(...)  // collected in    │
│                         //                       // AsyncLocalStorage│
│                         repo.save(aggregate)                        │
│                       })                                             │
│                         │                                            │
│                         ▼   pre-COMMIT, same TX                     │
│                   INSERT INTO outbox_event (...)                    │
│                   SELECT pg_notify('outbox_event', '')              │
└─────────────────────────┬───────────────────────────────────────────┘
                          │  COMMIT
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 2  ·  Postgres notifies                                      │
│                                                                      │
│   the notification queued by enqueue leaves at COMMIT              │
│                         │                                            │
│                         ▼   delivered on the open LISTEN socket     │
│                   ┌──────────────────┐                              │
│                   │   api process    │                              │
│                   │   LISTEN client  │ ← persistent dedicated conn  │
│                   └────────┬─────────┘                              │
└────────────────────────────┼────────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 3  ·  relay claims by lease (one statement, no open TX)      │
│                                                                      │
│   OutboxRelay.drainOnce()                                           │
│     UPDATE outbox_event SET attempts = attempts + 1,                │
│            next_attempt_at = now() + lease                          │
│       FROM (SELECT ... WHERE due                                    │
│             FOR UPDATE SKIP LOCKED)  ◄── enables horizontal scale   │
│     RETURNING ...            (locks released as the statement ends) │
└─────────────────────────┬───────────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 4  ·  named handlers, outside any transaction                │
│                                                                      │
│   for each claimed event (OUTBOX_CONCURRENCY in parallel):          │
│     for each handler not yet in `deliveries`:                       │
│       audit-log · webhook-fanout · notification-fanout · onEvent    │
│       each in its own short TX, cut at the handler budget           │
│                                                                      │
│     all ok      → markDelivered   (dispatched_at = now())           │
│     some failed → markFailed      (deliveries merged, last_error,   │
│                                    jittered retry, dead at max)     │
│     shutdown    → release         (attempts - 1, due now)           │
│     all guarded by WHERE attempts = <claimed attempts>              │
└─────────────────────────────────────────────────────────────────────┘
```

## The four actors

| Actor | What it is | Role |
|---|---|---|
| **Producer** | Your use case / service | Adds events via `aggregate.addEvent()` or `emitEvent(outbox, ...)` (joins the open `uow.run`). |
| **Outbox table** | `outbox_event` row | Holds the pending event in the same TX as the state change. |
| **Notifier** | `pg_notify` sent by `enqueue` | Runs on the same executor as the INSERT; delivered on COMMIT only. |
| **Dispatcher** | In-process worker | Holds a `LISTEN` socket and schedules wakes; its relay claims by lease and runs the named handlers. |

## How does Postgres "call" the app? (LISTEN/NOTIFY)

It doesn't. The app keeps a TCP socket open and Postgres pushes bytes into it.

```sql
-- in a long-lived connection owned by the dispatcher
LISTEN outbox_event;
```

As long as that connection exists, Postgres holds a reference. When *any* other
session executes `pg_notify('outbox_event', '')`, Postgres walks its
listener list and writes a `NotificationResponse` packet into each socket. The
Node `pg` driver receives it and fires the `"notification"` event. No polling,
no webhooks, no inbound port, just a socket that was already there.

Two practical details:

- `pg_notify` is **buffered until COMMIT**. If the originating TX rolls back,
  no notification escapes. This is what makes the rail safe without explicit
  coordination, listeners cannot see ghost events.
- The dispatcher uses a **dedicated `pg.Client`**, not the main pool. A
  connection in `LISTEN` mode is considered busy by Postgres and can't be
  reused for queries. The cost is one fixed connection per process.

The socket reconnects with backoff (250 ms up to 15 s) and is pinged every
15 s, and each reconnect triggers a catch-up drain. A polling fallback (every
30 s) and a wake at the next due retry catch anything else: this is what makes
the pipeline **at-least-once** rather than "best-case fast".

## One tier: named handlers

Every consumer of an event is a **named handler** with the same guarantee,
whether it ships with the stack (`audit-log`, `webhook-fanout`,
`notification-fanout`) or a module declares it with `onEvent(type, name, ...)`.
None runs inside the claim, so a slow handler holds no lock and a failing one
cannot undo what another wrote.

The row's `deliveries` column maps each handler name that succeeded to the time
it did. A retry runs only the handlers missing from it, which is why the name
is a **persisted key**: rename a handler and every pending event runs it again.
At-least-once per handler means a handler may run twice (a settle lost to a
crash, a lease that expired mid-run), so each one is idempotent on the event
id: a deterministic row id, a unique key with `ON CONFLICT DO NOTHING`, or an
idempotency key handed to the external service. `docs/EVENTS.md` lists the
argument for each shipped handler.

## Failure modes

| What fails | What you observe | Recovery |
|---|---|---|
| Business TX rolls back | No outbox row, no notify, no event. | Nothing to do, atomicity. |
| A handler throws, returns a failed `Result` or exceeds its budget | `attempts` grows, `last_error` (scrubbed, bounded) names the handler, `deliveries` keeps the others, `next_attempt_at` pushed out with jitter; a warning names the failing handlers and telemetry gets each failure. | Automatic retry of that handler only. |
| A handler keeps failing | After `OUTBOX_MAX_ATTEMPTS` the row gets `dead_at`; one `outbox.event_dead` is emitted in the same unit of work and logged. | Replayed every `OUTBOX_DEAD_RETRY_HOURS` (at most a quarter of each claim): fix the handler and the backlog drains on its own. Never purged while undelivered. |
| The process stops while handlers run | Abandoned and unstarted claimed rows are released: `attempts - 1`, due at once. | The next relay delivers them; a deploy never burns an attempt. |
| An event type has no handler in this process | `last_error` reads `<type> has no subscriber in this process`. | Deploy the handler; the next retry delivers it. |
| Dispatcher process dies mid batch | Claimed rows stay `dispatched_at IS NULL`. | They reappear when their lease expires, `attempts + 1`, on any process. |
| A settle arrives after its lease expired | The guard on `attempts` matches nothing, zero rows written; the relay neither counts nor announces it. | The process that reclaimed the row settles it. |
| LISTEN socket dies mid-life | Reconnect with exponential backoff, then a catch-up drain. The 30 s poll covers the gap. | Automatic. |
| Two dispatchers run in parallel | They split the work via `FOR UPDATE SKIP LOCKED`. | This is the scale-out story, not a bug. |

## Concurrency: how multiple dispatchers cooperate

```
Process A                          Process B
  │                                  │
  ▼                                  ▼
claim (one statement)              claim (one statement)
  FOR UPDATE SKIP LOCKED             FOR UPDATE SKIP LOCKED
  attempts + 1, lease 120 s          attempts + 1, lease 120 s
  ──► rows [1..12]                   ──► rows [13..24]
                                         (skipped 1..12, locked)
  │  locks released                  │  locks released
  ▼                                  ▼
handlers, no TX held               handlers, no TX held
  │                                  │
settle WHERE attempts = claimed    settle WHERE attempts = claimed
```

No leader election, no Redis lock, no coordinator. Row locks decide who claims
a row, for the length of one statement; the lease (`next_attempt_at`) keeps it
hidden while its handlers run; the `attempts` guard makes a late settle
harmless. The claim is capped at what the lease can process minus a fixed
settle margin, so a healthy relay always settles before its lease runs out. The same primitives power serious job
queues (Oban, Que, Sidekiq Pro).

## Where the moving parts live

Names are stable in the repo; the pattern is what matters.

- **Producer surface**: `aggregate.addEvent(...)` (DDD code) and
  `emitEvent(outbox, ...)` inside `uow.run()` (service-level or external-lib bridges).
- **Collector**: an `AsyncLocalStorage` opened by `IUnitOfWork.run(...)`:
  pulls events off aggregates inside the TX and hands them to the outbox.
- **Outbox repository**: `enqueue` (insert plus `pg_notify` on the same
  executor), `claim`, `pendingState`, `markDelivered`, `markFailed`,
  `release`; each settle reports whether its guard still matched.
- **Relay**: claims a batch, runs each event's named handlers with a budget
  and bounded concurrency, settles, announces a death once, in the same unit
  of work as the `dead_at` write.
- **Dispatcher**: started once at process boot (`.start()`), stopped on
  shutdown (`.stop()`, waits for the running drain, then releases what it
  abandoned). The constructor is passive, nothing happens until `.start()`
  builds the relay from the factory the container injects, drops the legacy
  notify trigger and opens the LISTEN socket.

## What guarantees you get

1. **Atomicity** between state change and event publication, same TX.
2. **At-least-once** delivery to every named handler, retried with jitter,
   then on a slow cadence once dead, until it succeeds. Handlers are
   idempotent on the event id, so at-least-once never means "twice visible".
3. **No lost delivery on crash**: a claim is a lease, not a lock held by a
   process; whatever a dead process claimed comes back when the lease expires.
4. **Ordering**: events are claimed in `occurred_at` order, but handlers run
   in parallel lanes and across processes, so completion order is not
   guaranteed. The audit chain follows completion order (its `sequence`), not
   `occurred_at`. Design handlers accordingly.

## Event visibility, public vs internal

Not every event in `@packages/events` is a public contract. An event used only
for internal coordination (audit trail, delivery telemetry, rate-limit
tracking) must never reach a customer webhook endpoint or appear in the
developer-facing catalog, changing its payload would then be a breaking
change.

`packages/events/src/visibility-map.ts` is the single SSOT that declares every
event type as either `"public"` or `"internal"`. The decision lives in code,
not in an admin toggle, because it is a product contract that should go through
code review, not a configuration change an operator can make by clicking.

Three consumers enforce it:

1. **`WebhookFanoutSubscriber`** (`apps/api/src/shared/services/webhook-fanout-subscriber.ts`):
   calls `isPublicEvent(event.type)` before fan-out; internal events flow to
   `audit_log` and in-process handlers but are never delivered to customer
   endpoints.

2. **`/developers/events` catalog** (`apps/app/src/features/developers/`):
   the public event reference page filters the catalog to `public` events only.
   Internal events remain invisible to API consumers and cannot accumulate
   subscribers who depend on a payload that may change.

3. **Webhook subscription picker** (`EventTypePicker` in the webhooks feature):
   the same filter gates what event types an endpoint can subscribe to. A
   customer cannot subscribe to `api_token.used` or `security.csrf.rejected`
   regardless of what they type in the form.

**Adding an event as `"public"` is a breaking-change boundary.** Once
published, renaming the event type or removing a field from its payload
requires a deprecation notice. Mark `"internal"` by default; graduate to
`"public"` only when a customer needs to build against it.

## Going further

- [EVENTS.md](./EVENTS.md): how to declare event types, register handlers,
  set retention, deploy serverless variants.
- The pattern in general: "Pattern: Transactional Outbox" by Chris Richardson
  (microservices.io) is the canonical write-up.
