# Event pipeline — how it works

A visual walkthrough of the transactional outbox + LISTEN/NOTIFY pipeline. For
the DX guide (how to declare events, register handlers, retention map), see
[EVENTS.md](./EVENTS.md).

## The problem this solves

You write business code that changes state in Postgres, and you also want
*something else* to happen as a consequence — an audit row, a webhook to a
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
│   your use case ──►  uow.run(async tx => {                          │
│                         aggregate.addEvent(...)  // collected in    │
│                         //                       // AsyncLocalStorage│
│                         repo.save(aggregate, tx)                    │
│                       })                                             │
│                         │                                            │
│                         ▼   pre-COMMIT, same TX                     │
│                   INSERT INTO outbox_event (...)                    │
└─────────────────────────┬───────────────────────────────────────────┘
                          │  COMMIT
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 2  ·  Postgres notifies                                      │
│                                                                      │
│   AFTER INSERT trigger fires:                                       │
│     PERFORM pg_notify('outbox_event', NEW.id)                       │
│                         │                                            │
│                         ▼   delivered on the open LISTEN socket     │
│                   ┌──────────────────┐                              │
│                   │   api process    │                              │
│                   │   LISTEN client  │ ← persistent dedicated conn  │
│                   └────────┬─────────┘                              │
└────────────────────────────┼────────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 3  ·  dispatcher drains (transactional, at-least-once)       │
│                                                                      │
│   OutboxDispatcher.triggerDrain()                                   │
│     ┌─ BEGIN                                                        │
│     │   SELECT ... FROM outbox_event                                │
│     │     WHERE dispatched_at IS NULL                               │
│     │     FOR UPDATE SKIP LOCKED  ◄── enables horizontal scale      │
│     │                                                                │
│     │   for each event:                                             │
│     │     ├─ AuditEventSubscriber.handle(event, tx)                 │
│     │     ├─ WebhookFanoutSubscriber.handle(event, tx)              │
│     │     └─ markDispatched(event.id, tx)                           │
│     │                                                                │
│     │   on failure: markFailed + exponential backoff w/ jitter      │
│     └─ COMMIT  (subscribers + dispatch flag are atomic)             │
└─────────────────────────┬───────────────────────────────────────────┘
                          │  post-COMMIT
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 4  ·  user handlers (post-commit, best-effort, isolated)     │
│                                                                      │
│   for each dispatched event:                                        │
│     userHandlers[event.type]?.forEach(h =>                          │
│       h.handle(event).catch(log)   // never re-fails the event      │
│     )                                                                │
└─────────────────────────────────────────────────────────────────────┘
```

## The four actors

| Actor | What it is | Role |
|---|---|---|
| **Producer** | Your use case / service | Adds events via `aggregate.addEvent()` or `emitEvent(outbox, ..., tx)`. |
| **Outbox table** | `outbox_event` row | Holds the pending event in the same TX as the state change. |
| **Notifier** | Postgres trigger + `pg_notify` | Fires on every INSERT; payload delivered on COMMIT only. |
| **Dispatcher** | In-process worker | Holds a `LISTEN` socket, drains batches, fans out to subscribers. |

## How does Postgres "call" the app? (LISTEN/NOTIFY)

It doesn't. The app keeps a TCP socket open and Postgres pushes bytes into it.

```sql
-- in a long-lived connection owned by the dispatcher
LISTEN outbox_event;
```

As long as that connection exists, Postgres holds a reference. When *any* other
session executes `pg_notify('outbox_event', '<id>')`, Postgres walks its
listener list and writes a `NotificationResponse` packet into each socket. The
Node `pg` driver receives it and fires the `"notification"` event. No polling,
no webhooks, no inbound port — just a socket that was already there.

Two practical details:

- `pg_notify` is **buffered until COMMIT**. If the originating TX rolls back,
  no notification escapes. This is what makes the rail safe without explicit
  coordination — listeners cannot see ghost events.
- The dispatcher uses a **dedicated `pg.Client`**, not the main pool. A
  connection in `LISTEN` mode is considered busy by Postgres and can't be
  reused for queries. The cost is one fixed connection per process.

A polling fallback (every 30 s) catches anything missed during reconnects —
this is what makes the pipeline **at-least-once** rather than "best-case fast".

## Two-tier delivery

Built-in subscribers and user handlers don't run with the same guarantees on
purpose:

| Tier | Runs | Guarantees | Use for |
|---|---|---|---|
| **Built-in subscribers** | Inside the drain TX | Atomic with `markDispatched`. A failure retries the whole event. | Audit log, webhook fan-out, anything where dropping a row is a compliance bug. |
| **User handlers** | After the drain commits | Isolated; a throw is logged but the event stays marked dispatched. | Emails, push notifications, search-index updates — side effects that have their own retry logic. |

If a future handler *cannot* tolerate at-most-once semantics, promote it to a
built-in subscriber. The split is intentional, not a limitation.

## Failure modes

| What fails | What you observe | Recovery |
|---|---|---|
| Business TX rolls back | No outbox row, no notify, no event. | Nothing to do — atomicity. |
| Built-in subscriber throws | Event row gets `attempts++`, `last_error` set, `next_attempt_at` pushed out. | Automatic retry on next drain. Investigate via the `last_error` column. |
| User handler throws | Event stays dispatched, error logged. | Add observability on the handler; it owns its retry policy. |
| Dispatcher process dies | Outbox rows accumulate (`dispatched_at IS NULL`). | Restart the process. On boot, the dispatcher drains the backlog before going idle. |
| LISTEN socket dies mid-life | Reconnect with exponential backoff. The 30 s poll covers the gap. | Automatic. |
| Two dispatchers run in parallel | They split the work via `FOR UPDATE SKIP LOCKED`. | This is the scale-out story, not a bug. |

## Concurrency: how multiple dispatchers cooperate

```
Process A                          Process B
  │                                  │
  ▼                                  ▼
BEGIN                              BEGIN
  │                                  │
  ▼                                  ▼
SELECT ... LIMIT 50                SELECT ... LIMIT 50
  FOR UPDATE SKIP LOCKED             FOR UPDATE SKIP LOCKED
  ──► rows [1..50]                   ──► rows [51..100]
                                         (skipped 1..50 — locked)
  │                                  │
  ▼                                  ▼
work                               work
  │                                  │
COMMIT                             COMMIT
```

No leader election, no Redis lock, no coordinator. Postgres row-level locks
do the entire job. The same primitive powers serious job queues (Oban, Que,
Sidekiq Pro).

## Where the moving parts live

Names are stable in the repo; the pattern is what matters.

- **Producer surface**: `aggregate.addEvent(...)` (DDD code) and
  `emitEvent(outbox, ..., tx)` (service-level or external-lib bridges).
- **Collector**: an `AsyncLocalStorage` opened by `IUnitOfWork.run(...)` —
  pulls events off aggregates inside the TX and hands them to the outbox.
- **Outbox repository**: `enqueue`, `findPendingBatch`, `markDispatched`,
  `markFailed`. The SQL trigger that fires `pg_notify` is created idempotently
  at dispatcher boot.
- **Dispatcher**: started once at process boot (`.start()`), stopped on
  shutdown (`.stop()`). The constructor is passive — nothing happens until
  `.start()` opens the LISTEN socket and ensures the trigger.

## What guarantees you get

1. **Atomicity** between state change and event publication — same TX.
2. **At-least-once** delivery to built-in subscribers — retried until they
   succeed or you give up manually.
3. **At-most-once** delivery to user handlers — they may run twice if
   something restarts mid-fanout, so make them idempotent or accept loss.
4. **Ordering**: events are dispatched in `occurred_at` order *within a
   single drain batch*. Across batches and across parallel dispatchers,
   ordering is not guaranteed. Design handlers accordingly.

## Going further

- [EVENTS.md](./EVENTS.md) — how to declare event types, register handlers,
  set retention, deploy serverless variants.
- The pattern in general: "Pattern: Transactional Outbox" by Chris Richardson
  (microservices.io) is the canonical write-up.
