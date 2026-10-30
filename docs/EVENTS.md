# Event-driven foundation: DX guide

Clean-stack ships a transactional outbox + dispatcher + audit/webhook subscribers. **You never touch the rail.** You declare events and handlers; the rest is automatic.

## Deployment requirements

The dispatcher is an **in-process Bun worker** holding a persistent `pg.Client` connection on `LISTEN outbox_event`. The webhook delivery worker uses a `setInterval` poll. Both die when the api process dies. This shapes where the api can run.

| Platform shape | Status | Notes |
|---|---|---|
| Railway, Fly.io, Render, Coolify, dedicated VM, K8s | ✅ Just works | Process stays alive; LISTEN persists across requests. |
| Cloud Run, App Runner, Azure Container Apps | 🟡 Set `min_instances ≥ 1` | Default scale-to-zero kills the worker. With one always-warm replica, behaves like the row above. |
| Vercel Functions, Netlify Functions, AWS Lambda | ❌ Re-wire required | Functions terminate after the response. The outbox table will fill up; no one drains it. |
| Cloudflare Workers, edge runtimes | ❌ Not viable | No Node.js process model + no `pg` client. Even with rewiring, no in-process worker lives long enough. |

**Symptom of mis-deployment**: the api answers requests, `outbox_event` rows accumulate (visible in any Postgres client), `audit_log` and `webhook_delivery` stay empty. Cause: dispatcher never ran or died between requests.

### Going serverless: three paths

If you must ship on serverless functions, the rail still works: you swap the dispatcher only:

1. **Cron-triggered drain** (lowest effort). Expose a protected `POST /internal/drain-outbox` (gated by the same HMAC layer as `/internal/rgpd-sweep`) that runs one `OutboxRelay.drainOnce()` (claim a batch by lease, run its handlers, settle each event). Trigger every 1-5 min via Vercel Cron / GitHub Actions / Inngest scheduled function. **Trade-off**: latency floor = cron interval (1 min on Vercel free, 30 s on Inngest).
2. **External queue** (lowest latency). Replace `outbox.enqueue()` with a push to SQS / Inngest / QStash inside the same TX (XA-style two-phase, or accept the well-known race window). The queue invokes a serverless function per message.
3. **Hybrid** (most pragmatic). Keep the api serverless, deploy a tiny worker container alongside (Railway/Fly, ~5 €/mo) running the existing `OutboxDispatcher` + `WebhookDeliveryWorker`. Pointing it at the same `DATABASE_URL` is enough; no other code changes.

The audit/webhook subscribers, the catalogue, the `uow.run` flush: all unchanged in any path. Only `OutboxDispatcher` swaps.

## Mental model

```
your code           ─►  uow.run(async () => repo.save(aggregate))
                                          │
                                          ▼ ALS collector flushes pre-COMMIT
                       outbox_event INSERT + pg_notify (same TX, delivered at COMMIT)
                                          │
                                          ▼
                                  OutboxDispatcher (in-process Bun worker)
                                          │
             OutboxRelay claims by lease: one statement, FOR UPDATE SKIP LOCKED,
             attempts + 1, next_attempt_at = now() + lease; no transaction stays open
                                          │
          every handler not yet in `deliveries`, each one in its own short transaction
       ┌──────────────────┬───────────────┴────────────┬──────────────────────────┐
       ▼                  ▼                            ▼                          ▼
   audit-log         webhook-fanout          notification-fanout        user handlers
   audit_log row     webhook_delivery rows   notification rows          onEvent(type, name, ...)
   id audit-<id>     key <id>:<endpointId>   key event:<id> per user    key <name>:<id>
                                          │
          all succeeded → markDelivered       one failed → markFailed: `deliveries` merged,
                                              `last_error` names it, retried with jitter
```

**Key invariant**: no lock and no transaction is held while a handler runs. Every handler, built in or user defined, is named, runs at least once and is retried alone until it succeeds: the row's `deliveries` records which handlers already succeeded, so a retry runs only the ones that failed. A handler is therefore idempotent on the event id (see [Delivery](#delivery-lease-retry-and-dead-replay)).

## How to emit a new event

**Step 1**: declare the type in `packages/events/src/event-types.ts`:

```ts
export const EventTypes = {
  // ...
  ORDER_PLACED: "order.placed",
} as const;
```

**Step 2**: declare the Zod payload in `packages/events/src/payloads.ts`:

```ts
export const OrderPlacedPayload = z.object({
  orderId: z.string(),
  userId: z.string(),       // subject (whose order)
  actorUserId: z.string(),  // who placed it: REQUIRED when actor ≠ subject (admin places on behalf, system bot, etc.)
  total: z.number().positive(),
});
export type OrderPlacedPayload = z.infer<typeof OrderPlacedPayload>;

// don't forget to add it to PayloadByEventType at the bottom
[EventTypes.ORDER_PLACED]: OrderPlacedPayload,
```

> **Actor identification (rule #7 of root CLAUDE.md).** `AuditEventSubscriber.extractActor` scans the payload for the actor in priority order: `actorUserId` → `inviterUserId` → `ownerUserId` → `userId`. **`userId` is the subject, not the actor by default.** When the actor differs from the subject (admin kicks member, system cron processes deletion, owner changes someone else's role), `actorUserId` must be a separate, NOT NULL field. Self-actor flows (sign-in, MFA toggle, self-deletion) can rely on `userId` alone. A row landing in `audit_log` with `actor_type="system"` should be the exception, not a default: the runtime guard at `enqueue` catches a missing/wrong-shape payload, but it can't catch a *semantically* missing actor: that's on the schema author.

**Step 3**: set retention in `packages/events/src/retention-map.ts`:

```ts
[EventTypes.ORDER_PLACED]: "compliance",  // or "operational" / "none"
```

**Step 4**: define the event class + emit from your aggregate:

```ts
class OrderPlaced extends BaseDomainEvent<OrderPlacedPayload> {
  readonly eventType = EventTypes.ORDER_PLACED;
  readonly aggregateId: string;
  readonly payload: OrderPlacedPayload;
  // ...
}

class Order extends Aggregate<IOrderProps> {
  static place(props: PlaceOrderProps): Order {
    const order = new Order(props, new UUID());
    order.addEvent(new OrderPlaced({
      orderId: order.id.value,
      userId: props.userId,
      total: props.total,
    }));
    return order;
  }
}
```

**Step 5**: persist in a use-case via `uow.run()`:

```ts
class PlaceOrderUseCase {
  constructor(
    private readonly uow: IUnitOfWork,
    private readonly repo: IOrderRepository,
  ) {}

  async execute(input: PlaceOrderInput): Promise<Result<Order, OrderError>> {
    return this.uow.run(async () => {
      const order = Order.place(input);
      return this.repo.save(order);
    });
  }
}
```

That's it. The event is in `outbox_event` (same TX as the order row), `audit_log` row written automatically, every matching `webhook_endpoint` receives a `webhook_delivery`.

> **Repos must opt into auto-tracking.** In your repo `save()`/`create()` impl, return `trackEventsOnSuccess(result, aggregate)` (helper in `@packages/drizzle`): that pushes pulled events into the ALS collector. Without it, events stay buffered on the aggregate and are silently lost.

## How to add an in-process handler

Oneline factory + inwire binding:

```ts
// modules/orders/module.ts
import { type EventHandler, onEvent } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";

declare module "inwire" {
  interface AppDeps {
    NotifyCustomerOnOrderPlaced: EventHandler<OrderPlacedEvent>;
  }
}

export const ordersModule = defineModule()((b) =>
  b.add(
    "NotifyCustomerOnOrderPlaced",
    onEvent(EventTypes.ORDER_PLACED, "notify-customer-on-order-placed", (c) => async (event) => {
      await c.IEmailService.sendTemplate(
        "order_confirmation", ..., handlerIdempotency("notify-customer-on-order-placed", event),
      );
    }),
  ),
);
```

`OutboxDispatcher.start()` discovers it automatically at boot via `Object.entries(di)` + `EVENT_HANDLER_SYMBOL` marker. **No registration array, no manifest.** The handler name is a persisted key (kebab-case, unique per event type, `<module>-<reaction>`): it is how a redelivery knows which handlers already ran, so renaming it reruns the handler on every pending event. A handler that talks to the outside world passes a key derived from it and the event id (`handlerIdempotency(name, event)` in `shared/`) so a redelivery never sends twice.

A handler that throws, returns a failed `Result` (`onEvent` throws it for you, so the application layer still never throws), or runs past `OUTBOX_HANDLER_BUDGET_SECONDS` is a failed delivery: the event is retried with only that handler (see [Delivery](#delivery-lease-retry-and-dead-replay)), and the relay logs and reports the failure itself. Never swallow an error or capture it in the handler; a swallowed error is a delivery the relay believes succeeded, a captured one is reported twice.

Shipped handlers and why a redelivery is harmless (six in all, every one keyed on the event id):

| Handler | Kind | Why a second run writes nothing twice |
|---|---|---|
| `audit-log` | built in | The row id is `audit-<eventId>`, inserted with `ON CONFLICT DO NOTHING` under the chain advisory lock: a redelivery appends no second link. |
| `webhook-fanout` | built in | One `webhook_delivery` per endpoint keyed `<eventId>:<endpointId>`, `ON CONFLICT DO NOTHING` on that key. |
| `notification-fanout` | built in | Every row carries a `dedup_key` (`event:<eventId>`, or the `dedupWindow` bucket for grouped types), inserted with `ON CONFLICT DO NOTHING` on the unique `(user_id, dedup_key)`. |
| `revoke-api-tokens-on-membership-lost` | user | Filters `revoked_at is null`, so a second run revokes nothing and emits nothing. |
| `notify-impersonated-user` | user | Sends with the idempotency key `<handlerName>:<eventId>`, which the email queue deduplicates. |
| `notify-backup-code-used` | user | Same key shape, same deduplication. |

## Built-in audit & webhook coverage

If your event is in `RETENTION_MAP` with `operational` or `compliance`:
- `audit_log` row written by the `audit-log` handler (`AuditEventSubscriber`) in its own short transaction (idempotent via `audit-${eventId}` deterministic ID + `ON CONFLICT DO NOTHING`).
- Every enabled `webhook_endpoint` matching `eventTypes ? <type>` AND `organizationId = event.organizationId` receives a `webhook_delivery` row, dispatched independently by `WebhookDeliveryWorker` (HMAC POST + retry + dead-letter).

> **Multi-tenant safety**: events with `organizationId = null` (platform-level: `user.created`, `user.signed_in`, etc.) **skip webhook fanout entirely**, never broadcast across tenants.

## Delivery: lease, retry and dead replay

Three queues share one delivery model: the outbox (`outbox_event`), the email queue (`email_message`) and webhook delivery (`webhook_delivery`). Each claims in SQL with the database clock, settles guarded by the claimed `attempts`, keeps a dead state that is replayed on a slow cadence, and gives the attempt back on shutdown. The shared SQL fragments (`dbNow`, `leasedBy`, `claimedSet`, `releasedSet`) live in `packages/drizzle/src/lease.ts` and the pure failure schedule (`failureSchedule`, `retryAfterSeconds`) in `shared/jitter.ts`; the live, dead and due selection stays written per queue, since the dead markers, the settled markers and the claim filters differ. The outbox is described first, then what the two other queues change.

The relay (`OutboxRelay`, driven by `OutboxDispatcher`) wakes on the LISTEN notification, on the next due retry (`pendingState().dueInMs`) and on a 30 s poll, then drains in rounds:

1. **Claim by lease.** One statement selects the due rows (`FOR UPDATE SKIP LOCKED`, oldest first), increments `attempts` and pushes `next_attempt_at` to `now() + OUTBOX_LEASE_SECONDS`. The statement commits on its own: no lock survives it. A relay that dies mid batch leaves rows that become claimable again when the lease expires, with `attempts + 1`. The clock is the database's, never the process's. The claim size is capped at what the lease can process (`floor((lease - 10 s) / handler budget) × OUTBOX_CONCURRENCY`, at most 50; the 10 s margin covers the claim and the settles), so a claimed row is settled before its lease runs out. Dead replays take at most a quarter of a claim, so a dead backlog never starves live events. Claiming never touches `dead_at`: a leased dead row is hidden by its lease, not revived.
2. **Run the handlers.** Up to `OUTBOX_CONCURRENCY` events settle in parallel. For each, every handler subscribed to its type and absent from `deliveries` runs, raced against `OUTBOX_HANDLER_BUDGET_SECONDS`. A type with no handler in the process fails with `<type> has no subscriber in this process` and stays pending. A row whose type is not in the relay's catalog list (a type removed from the catalog) is never claimed: it waits for the type to come back or for an operator to delete it.
3. **Settle, guarded by the claim.** All handlers succeeded → `markDelivered` sets `dispatched_at`. Otherwise `markFailed` merges the handlers that did succeed into `deliveries` (server side, earlier entries kept), writes `last_error` as `<handlerName>: <message>; ...` and schedules the retry with decorrelated jitter (`jitter.ts`). Each message is scrubbed before it is stored (query strings, emails, the SQL `params:` tail, same scrubber as telemetry) and the whole is cut at 1000 characters, since it reaches the audit trail through `outbox.event_dead`. Every failed settle logs a warning with the event id, type and failing handler names, and each handler failure or timeout is reported to telemetry. Both writes match `id`, the claimed `attempts` and `dispatched_at is null` and report whether they wrote: a settle that arrives after the lease expired and another relay reclaimed the row writes nothing, and is neither counted nor announced.
4. **Dead, then replayed.** After `OUTBOX_MAX_ATTEMPTS` failed attempts the row gets `dead_at` and its retry moves to every `OUTBOX_DEAD_RETRY_HOURS`. The first transition only logs an error, reports to telemetry and enqueues one internal `outbox.event_dead` (payload: `eventId`, `eventType`, `aggregateId`, `attempts`, `lastError`, `failedHandlers`, `actorUserId: null` because the relay is the actor); the `dead_at` write and that enqueue share one unit of work, so a death is never stored without its announcement nor announced without being stored. A dead `outbox.event_dead` is never announced again. Replaying a dead row keeps `dead_at` until a replay succeeds (`markDelivered` clears it), keeps counting `attempts` and still skips the handlers in `deliveries`; a fixed handler therefore drains the dead backlog on its own, with no manual replay, and a crash during a replay never re-announces the death.
5. **Shutdown gives the attempt back.** A handler abandoned at the end of the stop grace, and every claimed row the relay had not started when it halted, is released: `attempts - 1`, due at once, never dead. A deploy therefore never burns the last attempt of a healthy event.

**`handlerName` is a persisted key.** It is what `deliveries` stores, so renaming a handler makes every pending event run it again, and two handlers with the same name on one type are refused at boot (`DUPLICATE_HANDLER`). Names are kebab-case, `<module>-<reaction>` for user handlers.

**Bookkeeping is not a state change.** `attempts`, `deliveries`, `dead_at` and the lease describe how an event travels, not a change of business state, so they emit nothing (root rule 6 exception); the death of an event is the one fact announced, once.

**Audit chain order is completion order.** Handlers run outside any batch transaction and in parallel, so `audit_log` rows are appended in the order the `audit-log` handler completes, not in `occurred_at` order. The chain stays intact: appends are serialized by the advisory lock and `verifyChain` walks `sequence`, the append order. Read `occurred_at` for when it happened, `sequence` for chain position.

| Knob (`apps/api/.env.example`) | Default | Effect |
|---|---|---|
| `OUTBOX_LEASE_SECONDS` | 120 | How long a claimed row stays invisible; must be at least the handler budget + 10 s (checked at boot) |
| `OUTBOX_HANDLER_BUDGET_SECONDS` | 30 | Time a handler gets before it is failed as `timed out` |
| `OUTBOX_CONCURRENCY` | 4 | Events settled in parallel by one relay |
| `OUTBOX_MAX_ATTEMPTS` | 10 | Failed attempts before an event is dead |
| `OUTBOX_DEAD_RETRY_HOURS` | 6 | Replay cadence of a dead event |

### Email and webhook queues

| | Outbox | Email (`email_message`) | Webhook (`webhook_delivery`) |
|---|---|---|---|
| Worker | `OutboxRelay` | `EmailDeliveryWorker` | `WebhookDeliveryWorker` |
| Live rows | `dispatched_at is null`, not dead | `status = 'pending'` | `status in ('pending','failed')` |
| Dead marker | `dead_at` | `status = 'dead'` | `status = 'dead_letter'` with `next_attempt_at` set |
| Terminal | none, a dead row is replayed | `status = 'failed'` (permanent rejection) | `status = 'dead_letter'` with `next_attempt_at` null |
| Failed sends before dead | `OUTBOX_MAX_ATTEMPTS` (10) | 4 | 4 |
| Claim size | lease capacity, at most 50 | lease capacity in chunks of 100, at most 300 | lease capacity, at most 10 (8 at 330 s) |
| Announced on first death | `outbox.event_dead` | `email.delivery.exhausted` | `webhook.delivery.exhausted` |

- **Claim.** One statement, `FOR UPDATE SKIP LOCKED`, oldest first, `attempts + 1` and `next_attempt_at = now() + lease`, no transaction left open and none held across a network call. Dead rows that are due take at most a quarter of a claim, so a dead backlog never starves live rows. Claiming never changes `status`: a leased dead row is hidden by its lease, not revived.
- **Settle.** `markSent`, `markSuccess` and `markFailed` match `id`, the claimed `attempts` and a non-terminal status, and report whether they wrote. A settle that wrote nothing (the lease expired and another worker reclaimed the row) counts nothing, emits nothing and bumps no endpoint counter. A webhook attempt row is still recorded in that case, since a real HTTP request happened.
- **Dead.** A failed settle is dead when the row was already dead or `attempts` reached the ceiling. Dead rows are replayed every `EMAIL_DEAD_RETRY_HOURS` or `WEBHOOK_DEAD_RETRY_HOURS`; a replay that succeeds clears the dead state, a replay that fails stays dead and announces nothing. The exhausted event is emitted only on the first death, in the same unit of work as the settle that wrote it, and only when that settle wrote. Its actor is null (the worker is the actor).
- **Email.** A retryable failure keeps the row `pending` with a jittered retry until the ceiling, then `dead`. A permanent rejection (the provider refuses the message itself) goes straight to `failed`, which is never claimed again. A dead email is replayed only while its `created_at` is within `EMAIL_DEAD_REPLAY_WINDOW_HOURS`, so a stale sign-in link or reset email is never sent late. The `failed` sweep purges `failed` and `dead` rows together after `EMAIL_MESSAGE_FAILED_RETENTION_DAYS`.
- **Webhook.** The public contract keeps its four statuses. A `dead_letter` with a `next_attempt_at` is replayed on the cadence; one with a null `next_attempt_at` is terminal: endpoint missing or disabled, destination refused by the SSRF guard, and every row that was dead before the lease model, so a deploy replays no old backlog. A dead replay that finds its endpoint disabled settles terminal. The manual replay endpoint is unchanged: it creates a new row (`replay:` idempotency key) due now.
- **Lease budget.** Every network step is bounded so a claim fits its lease: the Resend batch call aborts after 30 s, the webhook host lookup after 5 s and the request after 30 s; a timeout is a retryable failure. Before each chunk (email) or delivery (webhook) after the first, the worker checks that the rest of its lease still covers one more step plus the settle margin, and releases what is left otherwise. The claim size is derived from the lease the same way.
- **Poison rows.** An email that fails to render (unknown template, payload the template cannot use) is settled `failed` on its own, with its exhausted event, and the rest of its chunk is still sent.
- **Release on stop.** Unstarted chunks (email) and unstarted deliveries (webhook) get `attempts - 1` and are due at once, never dead.
- **Double delivery.** The cadence replay of a dead webhook and a manual replay are independent: both can deliver the same event, with different idempotency keys (the manual row has its own `replay:` key). Receivers dedupe on the event id, not on the idempotency key alone.
- **Known quirk.** A webhook `processDelivery` that throws marks the delivery `failed` with no organization: no event and no endpoint bump on exhaustion.

| Knob (`apps/api/.env.example`) | Default | Effect |
|---|---|---|
| `EMAIL_LEASE_SECONDS` | 120 | How long a claimed email stays invisible; must be at least the 30 s send timeout + a 15 s margin (checked at boot); the claim takes only as many 100 row chunks as the lease covers, at most 3 |
| `EMAIL_DEAD_RETRY_HOURS` | 6 | Replay cadence of a dead email |
| `EMAIL_DEAD_REPLAY_WINDOW_HOURS` | 24 | Age after which a dead email is no longer replayed; must exceed `EMAIL_DEAD_RETRY_HOURS` (checked at boot) |
| `WEBHOOK_LEASE_SECONDS` | 330 | How long a claimed delivery stays invisible; must be at least the 5 s lookup timeout + the 30 s request timeout + a 30 s margin (checked at boot); the claim takes only as many deliveries as the lease covers, at most 10 |
| `WEBHOOK_DEAD_RETRY_HOURS` | 6 | Replay cadence of a replayable `dead_letter` |

**Schema note.** `db:push` does not detect a changed predicate on an existing partial index: it sees the index name and leaves it. The migration is the source of truth for `email_message_dead_retry_idx`, `email_message_failed_sweep_idx` (widened to `failed` and `dead`) and `webhook_delivery_dead_retry_idx`; an environment built with `db:push` before this change must drop and recreate them, or run the migration.

Proven against Postgres by `pnpm --filter api check:outbox-lease` (disjoint concurrent claims, lease expiry, stale settle reported as unwritten, `deliveries` merge, dead replay kept dead until delivered, release without penalty, dead share of a claim, rolled back enqueue, single audit link on redelivery, retention). The email and webhook queues are proven by `check:email-lease` and `check:webhook-lease` (disjoint concurrent claims, lease expiry with the database clock, stale settle writing nothing, dead replay only when due and capped at a quarter of the claim, live rows not starved, release without penalty; email adds the replay window and `failed` never claimed, webhook adds terminal `dead_letter` never claimed and a manual replay claimed once), and the settle of sent mail by `check:marksent`.

**Deploy order.** Stop every pod running the previous dispatcher before migration `0024` runs: an old dispatcher recreates the `outbox_notify` trigger on boot. The new dispatcher drops that trigger once on `start()` as a safety net, but an old pod restarting afterwards would bring it back until the next restart of a new one.

## Retention

Three sweep endpoints purge derived tables. All gated by `internalLayers` (HMAC), called by an external cron via `signedInternalFetch`. Defaults reflect SOTA 2026 research, configurable via env knobs.

| Table | Knob | Default | Filter | Conformance source |
|---|---|---|---|---|
| `outbox_event` | `OUTBOX_RETENTION_DAYS` | **7d** | `dispatched_at IS NOT NULL AND dispatched_at < cutoff` | NServiceBus / industry consensus 2025: debug window |
| `audit_log` (operational) | `AUDIT_LOG_OPERATIONAL_RETENTION_DAYS` | **90d** | `retention = 'operational' AND occurred_at < cutoff` | SOC2 minimum-safe (operational logs); RGPD minimisation |
| `audit_log` (compliance) | `AUDIT_LOG_COMPLIANCE_RETENTION_DAYS` | **365d** | `retention = 'compliance' AND occurred_at < cutoff` | SOC2 Type II ≥ 12 months; PCI-DSS 10.7; NIS2 baseline |
| `webhook_delivery` | `WEBHOOK_DELIVERY_RETENTION_DAYS` | **30d** | `status IN ('success','dead_letter') AND created_at < cutoff` (replayable and terminal `dead_letter` alike) | Stripe / GitHub / Hookdeck convergence |

Notes:
- **An outbox row is purged only once delivered**: the filter reads `dispatched_at` alone, so a dead row that never delivered stays until a replay succeeds, however old it is.
- **`pending` and `failed` webhook deliveries are NEVER purged automatically**: they signal worker death or active retry. A `pending` row stale > 24h must page on-call, not be cleaned up.
- **`retention = 'none'`** rows never reach the DB. `AuditEventSubscriber` returns early when `retentionFor(eventType) === "none"`: uncatalogued events are never written.

### Endpoints

- `POST /internal/sweep-outbox`: body `{ batchSize?: 1 to 50000 (default 5000), dryRun?: boolean }` → `{ deleted, durationMs, dryRun, batchCount }`
- `POST /internal/sweep-audit-log`: same body → `{ deletedPerBucket: { operational, compliance }, durationMs, dryRun }`
- `POST /internal/sweep-webhook-delivery`: same body → `{ deleted, durationMs, dryRun, batchCount }`

Each endpoint runs a batched `DELETE ... WHERE id IN (SELECT id ... ORDER BY <ts> LIMIT N FOR UPDATE SKIP LOCKED)` inside a transaction with `SET LOCAL statement_timeout = '5s'`, `lock_timeout = '500ms'`, `idle_in_transaction_session_timeout = '10s'`. Loops until 0 rows; hard-capped at 1000 batches per call.

### Order matters (FK constraint)

`webhook_delivery.outbox_event_id` is `ON DELETE RESTRICT`. The cron must run sweeps in this order:

1. `POST /internal/sweep-webhook-delivery`: frees terminal deliveries
2. `POST /internal/sweep-audit-log`: independent
3. `POST /internal/sweep-outbox`: last, otherwise `outbox_event` rows still referenced by undeleted deliveries trigger an FK violation

### Cron chain entrypoint

The chained sweep runner lives at `apps/api/src/cron/sweep.ts`: single source of truth, bundled by `bun build` into `dist/cron/sweep.js`. Reads `API_URL` and `INTERNAL_SIGNING_KEY` from env, hits the three endpoints in FK order, exits non-zero on first failure.

Runtime invocation (the same binary works in any orchestrator):

```bash
API_URL=https://api.example.com \
INTERNAL_SIGNING_KEY=<hex32+> \
  bun dist/cron/sweep.js
```

**Railway Cron** (reference deploy: see [`DEPLOY-RAILWAY.md`](DEPLOY-RAILWAY.md)) configures this via `infra/railway/cron.toml`: `startCommand = "bun dist/cron/sweep.js"`, `cronSchedule = "17 3 * * *"`, `restartPolicyType = "NEVER"`. The cron service reuses the api Docker image: no extra Dockerfile.

For other orchestrators (Fly Machines `--schedule`, Render Cron Job, Cloud Scheduler → Cloud Run job, K8s CronJob), point the entrypoint at the same `bun dist/cron/sweep.js` command and pass the two env vars. The signature primitives (`signedInternalFetch` with object input: see `apps/api/src/shared/internal-routes/internal-fetch.ts`) are platform-agnostic.

## Setup checklist post-clone

1. Tables (`outbox_event`, `audit_log`, `webhook_endpoint`, `webhook_delivery`) are created automatically: the api runs `drizzle migrate` at boot before `OutboxDispatcher.start()` (`apps/api/src/migrate.ts`). In native dev, `pnpm db:migrate` once before `pnpm dev` if you skipped Docker.
2. Set env vars in `apps/api/.env`:
   - `WEBHOOK_MASTER_KEY=<64 hex chars>`: generate via `openssl rand -hex 32` (required in production)
   - `AUDIT_TAMPER_EVIDENCE=false`: leave off; flip to `true` only when SOC2 audit demands hash chain

## Operational endpoints

- `GET /admin/audit-log`: list audit events for active org. Permission: `auditLog: ["read"]`. `organizationId` always derived from session, never query string.
- `POST /internal/sweep-{outbox,audit-log,webhook-delivery}`: retention sweeps (see § Retention above). Internal-gated (HMAC signature + optional private network).
- `GET/POST/PATCH/DELETE /settings/webhooks`: manage endpoints. Permission: `webhooks: ["read"|"write"]`. Plaintext secret returned **once at creation** (Stripe-style), never re-exposed.
- `POST /settings/webhooks/:id/rotate-secret`: rotate the endpoint signing secret; returns the new secret once. Both old + new secrets sign during the `WEBHOOK_SECRET_GRACE_HOURS` grace window.
- `POST /settings/webhooks/:id/test`: send a targeted `webhook.test` delivery to the endpoint. Also auto-fired on endpoint creation.
- `GET /settings/webhooks/:id/deliveries`: list deliveries with status filter (`?status=pending|success|failed|dead_letter`), cursor pagination.
- `GET /settings/webhooks/:id/deliveries/:deliveryId`: single delivery detail including `attempts[]` (per-attempt request/response headers + body).
- `POST /settings/webhooks/:id/deliveries/:deliveryId/replay`: re-enqueue a past delivery with fresh idempotency key.

## HMAC signature format (for receivers)

Header: `x-webhook-signature: t=<unix>,v1=<hex-sha256>`. During a secret rotation grace window the header carries multiple `v1=` values: `t=<unix>,v1=<hex_old>,v1=<hex_new>`. Accept if **any** `v1=` value verifies. Signed payload: `${timestamp}.${rawBody}`. Body shape: `{ id, type, data, time }` (CloudEvents-aligned).

Reject if timestamp drift > 5 min (replay protection). Use the `x-webhook-idempotency` header (`<eventId>:<endpointId>`) to dedupe on your side.

```ts
// Receiver verification: the shipped copy-paste version lives in
// apps/app/src/features/webhooks/components/verify-snippet.tsx
const sigHeader = req.headers["x-webhook-signature"];
const ts = Number(sigHeader.match(/t=([^,]+)/)?.[1]);
// Number("abc") is NaN and NaN > 300 is false, so the finite check is load-bearing.
if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return reject(401);
const expected = hmacSha256(`${ts}.${rawBody}`, secret);
// Every v1= value, not the first, during rotation both secrets sign.
const provided = sigHeader.match(/v1=([0-9a-f]+)/g)?.map((m) => m.slice(3)) ?? [];
if (!provided.some((sig) => timingSafeEqual(sig, expected))) return reject(401);
```

## Architecture choices (SOTA 2026)

- **UUID v7** for `outbox_event.id`, `audit_log.id`, `webhook_*.id`: time-ordered, B-tree locality preserved on inserts.
- **Postgres LISTEN/NOTIFY** via dedicated `pg.Client` (hors pool Drizzle) + **30s poll fallback** for connection drops; the listener reconnects with backoff (250 ms to 15 s) and pings every 15 s. `pg_notify` is sent by `enqueue` on the same executor as the insert, so it leaves only at commit; there is no trigger.
- **Claim by lease** (`FOR UPDATE SKIP LOCKED` + `UPDATE ... RETURNING` in one statement): multi-instance safe, and no lock is held while handlers run, so a slow or dead worker blocks nothing beyond its lease.
- **AEAD secret encryption** (`@noble/ciphers` XChaCha20-Poly1305 + HKDF-SHA256 per-org sub-key) for webhook secrets at rest.
- **Decorrelated jitter** retry (`apps/api/src/shared/jitter.ts`): `BASE * MULTIPLIER^attempts` then `random(BASE, upper)` clamped to 12h cap. Webhook and email deliveries turn dead on their 4th failed send; the outbox uses the same curve and turns dead after `OUTBOX_MAX_ATTEMPTS`.
- **Claim window pattern** in delivery worker: claim a batch with `next_attempt_at = now() + (BATCH_SIZE × FETCH_TIMEOUT + buffer)`, fetch HTTP **outside** the TX, update status in a fresh TX. Prevents lock starvation.
- **CloudEvents 1.0 envelope** stored in `outbox_event.metadata` (specversion, source, subject, traceparent, requestId) for cross-system interop. **`requestId`** carries the request's `X-Request-Id`: captured via an `AsyncLocalStorage` request context (`shared/request-context.ts`) at enqueue time, then copied into `audit_log.request_id` by the audit subscriber, so every audit row joins back to its originating HTTP request, pino logs, and Sentry event. (`traceparent` stays reserved for W3C trace context, unused until OTel is wired.)

## Visibility: public vs internal events

`packages/events/src/visibility-map.ts` is the **single-source allowlist** that determines whether an event is a public contract or an internal signal. Every `EventType` is classified as `"public"` or `"internal"`.

```ts
// visibility-map.ts
export const VISIBILITY = {
  "api_token.created": "public",
  "api_token.revoked": "public",
  "api_token.used":    "internal", // sampled high-volume signal, not a customer contract
  "webhook.endpoint.created": "internal", // operational plumbing, not customer-observable state
  // ...
} satisfies Record<EventType, Visibility>;
```

**Why the allowlist matters.** An event that is "public" is a **contract**: once a customer writes an integration against it, renaming the event type or dropping a payload field is a breaking change. Internal events can be renamed, reshaped, or removed at any time without notice. The classification forces a deliberate review in every PR that promotes an event to public: that's the point.

Three surfaces consume the visibility map simultaneously:

| Consumer | Where | Effect |
|---|---|---|
| `WebhookFanoutSubscriber` | `apps/api/src/shared/services/webhook-fanout-subscriber.ts` | Only public events are fanned out to customer webhook endpoints. Internal events skip fanout entirely. |
| `EventTypePicker` + `webhookFormSchema` | `apps/app/src/features/webhooks/forms/event-type-picker.tsx` + `webhooks.schema.ts` | The subscription picker shows only `SUBSCRIBABLE_EVENT_TYPES` (public events). The Zod schema rejects any internal event type as a selector. |
| `/developers/events` catalog | `apps/app/src/features/developers/components/event-types-table.tsx` | Only public events are listed in the public-facing event catalog page. |

Changing a public event type string or removing a payload field requires a changelog entry and a deprecation window. Promoting a new event to public is permanent: plan for it in the PR review.

## Notifications : catalogue de notifiabilité

`packages/events/src/notification-map.ts` est la **troisième projection** du catalogue d'événements, après `visibility-map.ts` (webhooks) et `retention-map.ts` (purge).

```ts
// notification-map.ts
export const NOTIFICATION_MAP = {
  "billing.payment.failed": { audience: { can: { billing: ["read"] } }, category: "billing", forced: true },
  "org.member.joined":      { audience: { can: { organization: ["update"] } }, category: "org", groupBy: "resource" },
  // ...
} satisfies Partial<Record<EventType, NotificationConfig>>;
```

**Ce que cette projection projette.** Pour chaque type d'événement listé, elle déclare :
- `audience` : qui doit recevoir la notification : `"self"` (l'utilisateur concerné), `"actor"`, `"org:all"`, ou `{ can: OrgPermissions }` (les membres dont le rôle porte la capability). La résolution capability→roles est faite par `rolesWith(audience.can)` (`@packages/access-control`) et reste cohérente avec le reste des gates de l'app.
- `category`: regroupement UI (`security`, `org`, `billing`, `activity`).
- `forced?: true` : contourne les préférences utilisateur et le batching email (bypass critique du SOTA).
- `groupBy` et `dedupWindow` : fenêtre de déduplication et clé de regroupement lecteur (style Linear "X et 3 autres").

**Pourquoi elle ne crée aucun événement.** Une notification est une projection de lecture d'un événement déjà audité et déjà émis dans l'outbox. Émettre un `notification.created` créerait une boucle : son propre abonné (`NotificationFanoutSubscriber`) déclencherait à nouveau l'insertion. La création de notifications n'émet aucun événement : une notification est une projection d'un événement déjà audité, et émettre un `notification.created` créerait une boucle avec son propre abonné. En revanche, les mutations de préférences (`notification.preference.updated`, `notification.org_preference.updated`) et le passage à l'état lu (`notification.read`) émettent bien des événements car ce sont des changements d'état persistant. Le catalogue est à **86 événements / 35 publics / 51 internes**.

**`NotificationFanoutSubscriber`** est l'abonné outbox qui lit cette projection (aux côtés de `AuditEventSubscriber` et `WebhookFanoutSubscriber`). C'est le handler nommé `notification-fanout` : il tourne dans sa propre transaction courte et chaque ligne porte une `dedup_key` (`event:<eventId>`, ou le créneau `dedupWindow`) insérée avec `ON CONFLICT DO NOTHING` sur l'index unique `(user_id, dedup_key)`, donc une relivraison n'ajoute aucune ligne. Les événements absents du catalogue ne génèrent aucune notification (le comportement par défaut : la plupart des 86 événements sont audit-only).

**La cascade de préférences est résolue dans la requête d'insertion**, jamais en amont ni destinataire par destinataire : un `LEFT JOIN notification_preference` par portée et par canal, sur le même `INSERT ... SELECT`.

```
ligne org verrouillée  >  ligne utilisateur  >  ligne org (défaut non verrouillé)  >  activé
```

Le canal in-app décide de la clause `WHERE` (la ligne n'est pas insérée du tout), le canal email décide d'un `CASE` qui remplit ou non `emailPendingAt` : couper l'email sans couper l'in-app produit donc une notification sans envoi en attente. Un événement `forced` court-circuite les quatre niveaux et n'émet même pas les jointures.

**Pourquoi dans le SQL et pas dans un service.** L'audience d'organisation est un `INSERT ... SELECT` sur `member` : résoudre les préférences en TypeScript imposerait soit une boucle par destinataire, soit un pré-chargement de toutes les lignes de préférence de l'organisation. Un service `resolve()` a existé en parallèle du fan-out sans jamais être appelé, et sa cascade avait déjà divergé (il ignorait les défauts d'organisation non verrouillés) : il a été supprimé. **Une seule implémentation, à l'endroit où elle s'applique.**

**Vérification.** `pnpm --filter api check:fanout` (`apps/api/scripts/check-fanout-preferences.ts`) exécute 8 cas contre Postgres : in-app coupé, email coupé seul, `forced`, aucune préférence, filtrage d'un membre dans une audience d'organisation, verrou d'organisation contre choix utilisateur, défaut d'organisation appliqué, choix utilisateur prioritaire sur un défaut. `pnpm --filter api check:digest` (`apps/api/scripts/check-digest-window.ts`) en exécute 19 de plus sur la fenêtre de regroupement : les trois cadences (`immediate` / `hourly` / `daily`) et l'échéance qu'elles écrivent dans `email_pending_at`, l'immunité des événements `forced`, la fenêtre vide qui n'envoie rien, le regroupement en un seul e-mail, et le bail de `flush-notification-emails` face à deux exécutions concurrentes. **À relancer après toute modification du fan-out** : aucun test unitaire ne peut couvrir ces cas, une transaction mockée n'évalue aucun `WHERE` et le dépôt n'a pas de harnais d'intégration base. C'est ce script, et lui seul, qui a révélé qu'un `CASE WHEN ... THEN $date` casse l'inférence de type de Postgres (cast `::timestamp` obligatoire).

## BetterAuth bridge: what fires what

The boilerplate emits **92 events** (35 public + 57 internal) automatically. Sources: 25 from `apps/api/src/auth.ts` covering BetterAuth lifecycles, 5 from `modules/rgpd/`, 3 from `modules/uploads/`, **8 from `modules/webhooks/`** (3 CRUD + 5 internal: test, secret_rotated, disabled, exhausted, replayed), 1 from `modules/policies/`, **3 from `modules/consents/`**, 7 from security (3 middleware/endpoint + 2 abuse-prevention hooks in `auth.ts` + 2 from `SecuritySignalsService`), **4 from `modules/billing/`**, **1 from quota middleware**, **1 from audit-log operator** (`security.operator.audit_accessed`), **1 from email delivery worker** (`email.delivery.exhausted`), **6 from `modules/admin/`** (Phase C.3: 4 actions + 2 impersonation lifecycle), **3 from `modules/api-token/`** (Phase C.4: created, revoked, used), **3 from `modules/notifications/`** (Phase D.3: preference.updated, org_preference.updated, read), **14 from `sso`/`scim`** (Phase C.7: 7 `sso.*` provider/domain/enforcement/login events + 7 `scim.*` connection/user lifecycle events), **1 from `modules/profile/`** (Phase E.1a: `user.locale.changed`), **1 from the outbox relay** (`outbox.event_dead`). Source of truth: `packages/events/src/event-types.ts` + `packages/events/src/visibility-map.ts`. **Internal events** skip `WebhookFanoutSubscriber`: they flow to `audit_log` and in-process handlers only.

### Via `databaseHooks` (TX-bound, captures all flows)
- `USER_CREATED`: `databaseHooks.user.create.after`
- `USER_SIGNED_IN`: `databaseHooks.session.create.after`
- `USER_SIGNED_OUT`: `databaseHooks.session.delete.after` (null `actorUserId`), or `AdminModerationService` when an admin ended the session (the admin as `actorUserId`)
- `USER_ACCOUNT_UNLINKED`: `databaseHooks.account.delete.after` (skip credential)

### Via `hooks.after` + `createAuthMiddleware` (path-based, plugin events)
Filter: `if (ctx.context.returned instanceof APIError) return` (skip on 4xx/5xx).
- `USER_MFA_ENABLED`: `path === "/two-factor/enable"`
- `USER_MFA_DISABLED`: `path === "/two-factor/disable"`
- `USER_PASSKEY_ADDED`: `path === "/passkey/verify-registration"` + lookup latest passkey
- `USER_PASSKEY_REMOVED`: `path === "/passkey/delete-passkey"` + body.id
- `USER_EMAIL_VERIFIED`: `path === "/verify-email"` (skipped if session not yet active: limitation)
- `USER_PASSWORD_CHANGED`: `path === "/change-password"`
- `USER_PROFILE_UPDATED`: `path === "/update-user"`. Payload: `{ userId, changes }` (field-level diff).
- `USER_ACCOUNT_LINKED`: `path === "/link-social"` + lookup latest non-credential account created < 5s ago

### Via BetterAuth callbacks (native)
- `USER_PASSWORD_RESET_REQUESTED`: `emailAndPassword.sendResetPassword`
- `USER_PASSWORD_CHANGED`: `emailAndPassword.onPasswordReset`
- `USER_MAGIC_LINK_REQUESTED`: `magicLink.sendMagicLink`
- `USER_EMAIL_CHANGE_REQUESTED`: `user.changeEmail.sendChangeEmailConfirmation`. Payload: `{ userId, newEmail }`. Confirmation sent to the **current** address.

### Via `organizationHooks` (org plugin)
- `ORG_CREATED` (afterCreateOrganization) · `ORG_UPDATED` · `ORG_DELETED` · `ORG_MEMBER_INVITED` (afterCreateInvitation) · `ORG_INVITATION_CANCELLED` · `ORG_MEMBER_REMOVED` (afterRemoveMember) · `ORG_MEMBER_ROLE_CHANGED` (afterUpdateMemberRole)
- `ORG_MEMBER_JOINED` fires from **two** hooks: `afterAddMember` (direct add: org-create creator + signup auto-personal-org) **and** `afterAcceptInvitation` (member joins via invite). The two lifecycles are independent in BetterAuth: wiring only one would silently drop the other path.

### Via RGPD service
- `USER_DELETION_{REQUESTED,CANCELLED}` · `USER_DELETED` · `USER_EXPORT_{REQUESTED,COMPLETED}` (payload contains `storageKey`, **not** the presigned URL: security)

### Via UploadService
- `UPLOAD_REQUESTED` · `UPLOAD_CONFIRMED` · `UPLOAD_DELETED` (payload uses `hashKey(key)`: sha256 truncated, never the raw filename, for PII protection)

### Via WebhooksService
- `WEBHOOK_ENDPOINT_CREATED` · `WEBHOOK_ENDPOINT_UPDATED` · `WEBHOOK_ENDPOINT_DELETED` (payload carries `actorUserId` propagated from the HTTP boundary: `c.get("user").id`)

**Phase C.5: 4 new internal events** (non-subscribable, non-fanout: guarded by `INTERNAL_EVENT_TYPES` in `WebhookFanoutSubscriber`; `retention: "operational"`):
- `WEBHOOK_TEST` (`webhook.test`): emitted when a test delivery is triggered (`POST /settings/webhooks/:id/test` or auto-on-create). Payload: `{ endpointId, organizationId, actorUserId }`.
- `WEBHOOK_ENDPOINT_SECRET_ROTATED` (`webhook.endpoint.secret_rotated`): secret rotation completed. Payload: `{ endpointId, organizationId, actorUserId }`.
- `WEBHOOK_ENDPOINT_DISABLED` (`webhook.endpoint.disabled`): auto-disable fired after sustained failures. Payload: `{ endpointId, organizationId, consecutiveFailures: number, lastFailedAt: string }`.
- `WEBHOOK_DELIVERY_EXHAUSTED` (`webhook.delivery.exhausted`): delivery dead-lettered after all retry attempts. Payload: `{ deliveryId, endpointId, organizationId, eventType: string, attempts: number }`.
- `WEBHOOK_DELIVERY_REPLAYED` (`webhook.delivery.replayed`): a member queued a delivery again (`POST /settings/webhooks/:id/deliveries/:deliveryId/replay`), emitted in the same transaction as the new delivery row. Payload: `{ organizationId, endpointId, deliveryId, replayedDeliveryId, actorUserId }`, retention `operational`.

**Phase D.5: 1 new internal event** (non-subscribable, non-fanout; `retention: "operational"`):
- `EMAIL_DELIVERY_EXHAUSTED` (`email.delivery.exhausted`): an `email_message` row exceeded the retry ceiling and was dead-lettered. Payload: `{ messageId: string, toAddress: string, kind: string, attempts: number }`. Never fans out to user webhook endpoints: it is an infrastructure signal for operator alerting.

### Via `AdminModerationService` (Phase C.3, atomic since Phase K)

Emitted via `emitEvent(outbox, ...)` by `AdminModerationService`, inside the `uow.run` of the write. **Residual window**: impersonation only exists in the auth library, which commits on its own connection, so it runs last in the unit; a commit that fails after it leaves the action without its event. A password reset is the opposite: its event commits first and the mail follows, a failed mail is retried by the admin. All 6 events carry `actorUserId` (the operator's id, distinct from `userId` which is the target): actor identification is explicit, never inferred from session state. All events have `organizationId = null` (platform-level, no org context) and `retention: "compliance"`.

- `ADMIN_IMPERSONATION_STARTED` (`admin.impersonation.started`): emitted in the unit of `POST /admin/impersonation/:id/start`, the BetterAuth session is issued right after and a refusal rolls the event back. Payload: `{ actorUserId: string, userId: string, reason: string, ticketRef?: string, ip: string | null, expiresAt: string }`. `reason` is never empty (min 1 char enforced at the API boundary).
- `ADMIN_IMPERSONATION_STOPPED` (`admin.impersonation.stopped`): emitted in the unit of `POST /admin/impersonation/stop`, rolled back if BetterAuth `stopImpersonating` refuses. Payload: `{ actorUserId: string, userId: string, durationMs: number }`.
- `ADMIN_USER_BANNED` (`admin.user.banned`): emitted by `AdminModerationService.ban`, along with one `user.signed_out` per ended session. Payload: `{ actorUserId: string, userId: string, reason: string, expiresAt: string | null }`. `expiresAt: null` means a permanent ban.
- `ADMIN_USER_UNBANNED` (`admin.user.unbanned`): emitted by `AdminModerationService.unban`, only if the user was banned, and when a sign-in clears an expired ban (null actor). Payload: `{ actorUserId: string | null, userId: string }`.
- `ADMIN_USER_PASSWORD_RESET` (`admin.user.password_reset`): emitted by `AdminModerationService.resetPassword` (triggers a BetterAuth reset email). Payload: `{ actorUserId: string, userId: string }`.
- `ADMIN_USER_SESSIONS_REVOKED` (`admin.user.sessions_revoked`): emitted by `AdminModerationService.revokeSessions`, along with one `user.signed_out` per ended session. Payload: `{ actorUserId: string, userId: string, count: number }`. `count` is the number of sessions deleted.

### Via `StepUpService` (Phase K)

Internal, compliance retention. The subject is the actor, so `userId` stands for it.

- `ADMIN_STEP_UP_VERIFIED` (`admin.step_up.verified`): a code opened a confirmation for a session, in the same unit as its row. Payload: `{ userId: string, validUntil: string, ip: string | null }`.
- `ADMIN_STEP_UP_FAILED` (`admin.step_up.failed`): a wrong or replayed code. Best effort, the refusal stands if the write fails. Payload: `{ userId: string, reason: "invalid_code" | "replayed_code", ip: string | null }`.

### Via `StaffService` / `StaffAccessService` (Phase K)

- `ADMIN_STAFF_ADDED` (`admin.staff.added`): a user joined the staff, or came back after a revocation. Payload: `{ actorUserId: string | null, userId: string, role: string, source: "env" | "console" }`. `actorUserId` is `null` for the bootstrap insert of an id listed in `PLATFORM_ADMIN_IDS`, which only the real insert announces.
- `ADMIN_STAFF_ROLE_CHANGED` (`admin.staff.role_changed`): payload `{ actorUserId: string, userId: string, from: string, to: string }`.
- `ADMIN_STAFF_REVOKED` (`admin.staff.revoked`): payload `{ actorUserId: string, userId: string, role: string }`. Also emitted by an account wipe, inside its transaction, with the member as actor since the deletion is their own request.

The rows backfilled by migration `0028` announce nothing: no request and no actor exist at that point, the migration file is the record.

### Via `PolicyAcceptanceService` (Phase A.2)
- `USER_POLICY_ACCEPTED` (`user.policy.accepted`): payload `{ userId, policyType, policyVersion, ipAddress? }`, retention `compliance`. Self-actor: `userId` resolves as the actor via `AuditEventSubscriber.extractActor`. Emitted from `PolicyAcceptanceService.accept`, which is called from **two sites**: (1) the BetterAuth `/verify-email` after-hook in `auth.ts` (sign-up path, idempotent via `getStaleTypes`) and (2) the `POST /me/policies/accept` route (explicit re-acceptance by already-authenticated users).

### Via `ConsentService` (Phase A.4)

- `USER_COOKIE_CONSENT_GRANTED` (`user.cookie_consent.granted`) : émis par `ConsentService.record` à chaque sauvegarde. Payload : `{ subjectId: string (device cookie), userId?: string (null pour guests), categories: ConsentCategory[], policyVersion: string, ipAddress?, userAgent? }`, retention `compliance`. L'`actorUserId` résout sur `userId` quand l'utilisateur est connecté (self-actor) ; `null` pour un guest (le `subjectId` est la seule identité disponible). Les guests obtiennent un record réconcilié au login via `ConsentService.reconcile` (hook `hooks.after` + `ctx.context.newSession`).
- `USER_COOKIE_CONSENT_WITHDRAWN` (`user.cookie_consent.withdrawn`) : émis par `ConsentService.withdraw`. Même shape de payload. Retention `compliance`.
- `USER_COOKIE_CONSENT_LINKED` (`user.cookie_consent.linked`) : émis par `ConsentService.reconcile` quand au moins un record guest est rattaché au compte au login (rien si tout était déjà rattaché). Payload : `{ userId, subjectId, consentRecordIds: string[] }`, self-actor (`userId`), retention `compliance`, visibilité `internal`.

### Via security middleware / endpoint (Phase C.1)

Ces 3 events ne sont pas des state-changes métier : ils signalent des rejets de sécurité au niveau infra. Émis via `emitEvent(outbox, ...)` **hors agrégat** (même chemin que les events RGPD/uploads/webhooks), avec `actorUserId` **nullable** (pas de session authentifiée fiable sur ces rejets).

- `SECURITY_RATE_LIMIT_EXCEEDED` (`security.rate_limit.exceeded`) : émis par le rate-limit middleware sur rejet d'une requête auth. Payload : `{ actorUserId: string | null, ip: string (max 45), policyName: string (max 64), path: string (max 512), method: string (max 16) }`, retention `operational`.
- `SECURITY_CSP_VIOLATION` (`security.csp.violation`) : émis par l'endpoint public `POST /csp-report`. Payload : `{ documentUri, violatedDirective, blockedUri, actorUserId? }`, retention `operational`.
- `SECURITY_CSRF_REJECTED` (`security.csrf.rejected`) : émis par le CSRF middleware sur Origin invalide. Payload : `{ ipAddress, path, origin?, actorUserId? }`, retention `operational`.

### Via abuse-prevention hooks (Phase C.1 s5a, `auth.ts` `hooks.before`)

Émis via `emitEvent(outbox, ...)` dans le `hooks.before` BetterAuth, juste avant le rejet (`throw APIError`). **Piège BetterAuth** : dans un `hooks.before`, `ctx.context.request` et `ctx.context.session` sont **`undefined`** (le before-hook global tourne avant le session-middleware) : l'IP se lit sur `ctx.headers`, et l'actor authentifié (`/change-password`) via `auth.api.getSession({ headers: ctx.headers })`. Câbler sur `ctx.context.*` fait throw le calcul d'IP avant l'emit → event perdu silencieusement (les tests unitaires ne montent pas les hooks, seule une passe end-to-end le révèle).

- `SECURITY_SIGNUP_REJECTED` (`security.signup.rejected`) : émis sur blocage d'un email jetable au sign-up. Payload : `{ actorUserId: null, email: string (max 254), ip: string | null, reason: "disposable_email" }`, retention `operational`.
- `SECURITY_IMPOSSIBLE_TRAVEL_DETECTED` (`security.impossible_travel.detected`) : émis au sign-in quand le pays diffère de celui d'une session ouverte dans la fenêtre `IMPOSSIBLE_TRAVEL_WINDOW_MINUTES`, sans bloquer. Payload : `{ userId, sessionId, previousSessionId, previousCountry, country, ip: string | null, elapsedSeconds }`, retention `operational`.
- `SECURITY_GEO_DENIED` (`security.geo.denied`) : émis sur refus par la deny-list pays ou ASN au sign-in et au sign-up. Payload : `{ actorUserId: string | null, ip: string | null, path, country: string | null, asn: string | null, reason: "country" | "asn" }` : `actorUserId` nul avant vérification des identifiants. Retention `operational`.
- `SECURITY_PASSWORD_BREACHED` (`security.password.breached`) : émis sur un mot de passe compromis HIBP au sign-up / reset / change-password (le rejet 422 vient déjà de la NIST policy). Payload : `{ actorUserId: string | null, email: string | null, ip: string | null, path }` : `actorUserId`/`email` portés par la session réelle sur `/change-password`, `null` sur sign-up/reset (pas de session). Retention `operational`.

### Via subscription events (`auth.ts` `@better-auth/stripe` callbacks: Phase B.1)

Emitted via `emitEvent(outbox, ...)` inside the `@better-auth/stripe` plugin callbacks wired in `apps/api/src/auth.ts` (`onSubscriptionComplete`, `onSubscriptionUpdate`, and the `onEvent` invoice.payment_failed handler). These are Stripe-originated lifecycle events, not triggered by a user HTTP request, so `actorUserId` is nullable (the Stripe webhook arrives on behalf of the org with no authenticated session). Subscription state SSOT is the plugin `subscription` table; these events are the compliance + operational audit trail on top of it.

- `BILLING_SUBSCRIPTION_CREATED` (`billing.subscription.created`): emitted on `customer.subscription.created` Stripe webhook (first active subscription for an org). Payload: `{ organizationId, subscriptionId, tier, status, actorUserId: null, currentPeriodEnd }`, retention `compliance`.
- `BILLING_SUBSCRIPTION_UPDATED` (`billing.subscription.updated`): emitted on `customer.subscription.updated` when the new status is not terminal. Same payload shape as `created`, retention `compliance`.
- `BILLING_SUBSCRIPTION_CANCELLED` (`billing.subscription.cancelled`): emitted on `customer.subscription.updated` when status is `canceled` / `incomplete_expired` / `unpaid`. Payload: `{ organizationId, subscriptionId, tier, status, actorUserId: null }`, retention `compliance`.
- `BILLING_PAYMENT_FAILED` (`billing.payment.failed`): emitted on `invoice.payment_failed` Stripe webhook. Payload: `{ organizationId, subscriptionId, invoiceId, actorUserId: null }`, retention `compliance` (kept long-term as part of the billing/financial audit trail: the whole `billing.*` family is `compliance` so there is no retention divergence within it).

**Status mapping**: `subscriptionEventType(status)` in `apps/api/src/modules/billing/application/subscription-events.ts` maps Stripe subscription statuses to the three state events: `canceled` / `incomplete_expired` / `unpaid` → `BILLING_SUBSCRIPTION_CANCELLED`; all other statuses → `BILLING_SUBSCRIPTION_UPDATED`. `BILLING_SUBSCRIPTION_CREATED` fires only on the initial `customer.subscription.created` webhook path.

### Via `requireQuota` middleware (Phase B.2)

Emitted via `emitEvent(outbox, ...)` in `requireQuota` when a request hits a quota ceiling. The middleware runs before the business handler; if the quota is already at or above the limit, it returns `429 BILLING_QUOTA_EXCEEDED` and emits the event. **`reserveQuota` (the authoritative in-TX check) does NOT emit this event**: it only calls `assertQuota` which throws. A caller enforcing via `reserveQuota` inside `uow.run()` without the middleware must emit the event themselves if they want the telemetry (or mount `requireQuota` on the route).

- `BILLING_QUOTA_EXCEEDED` (`billing.quota.exceeded`): emitted on quota ceiling hit. Payload: `{ organizationId, resource: string, limit: number, attempted: number, tier: string, actorUserId: string }`, retention `operational`.

### Via `auth.ts` `hooks.after` (Phase C.7: `@better-auth/sso` / `@better-auth/scim`)

The SSO events are emitted via `emitEvent(outbox, ...)` in `apps/api/src/auth.ts`'s `hooks.after`, path-keyed off `SSO_PATHS`/`SCIM_PATHS` (`apps/api/src/shared/auth/sso-paths.ts`). The SCIM connection events come from `ScimConnectionService` (`apps/api/src/shared/services/scim-connection.service.ts`), the only caller of the plugin's managed-connection server APIs. SCIM user endpoints authenticate with a bearer token, not a session: the actor is the owner who created the connection (`scimConnectionCreator`), not `ctx.context.session`. `scimProviderId`/`providerId` in the SCIM payloads carry the managed connection id; the key names are kept for payload stability.

- `SSO_PROVIDER_REGISTERED` (`sso.provider.registered`): `path === SSO_PATHS.register`. Payload: `{ actorUserId, organizationId, providerId, protocol: "oidc" | "saml", domain }`, retention `internal`.
- `SSO_PROVIDER_UPDATED` (`sso.provider.updated`): `path === SSO_PATHS.updateProvider`. Payload includes `changedFields: string[]`.
- `SSO_PROVIDER_DELETED` (`sso.provider.deleted`): `path === SSO_PATHS.deleteProvider`. The provider row is gone by the time `hooks.after` runs, so a pre-delete snapshot (`ssoProviderDeleteSnapshots`, keyed on `providerId`) supplies `organizationId` for the payload.
- `SSO_DOMAIN_VERIFIED` (`sso.domain.verified`): `path === SSO_PATHS.verifyDomain`, only after the endpoint's own DNS TXT check succeeds.
- `SSO_ENFORCEMENT_CHANGED` (`sso.enforcement.changed`): emitted by `AdminActionService.setSsoEnforcement` (`POST /settings/organization/sso-enforcement`, `organization:["update"]`), not a `hooks.after` path: the only one of the 13 not routed through the SSO/SCIM plugin's own endpoints.
- `SSO_LOGIN_SUCCESS` (`sso.login.success`): public. Payload: `{ userId, providerId, organizationId, protocol, jitProvisioned: boolean }`. `jitProvisioned` is a heuristic (`user.createdAt` within the last 10s of the login), not a plugin-native flag.
- `SSO_LOGIN_FAILURE` (`sso.login.failure`): public. Emitted from the plugin's own error redirect path; `providerId` may be `"unknown"` when the failure happens before a provider is resolved.
- `SCIM_CONNECTION_CREATED` (`scim.connection.created`): `POST /settings/organization/scim-connection` on an organization with no active connection.
- `SCIM_CONNECTION_TOKEN_ROTATED` (`scim.connection.token_rotated`): internal. The same route on an organization that already has one: a new credential is issued and every other active one is revoked.
- `SCIM_CONNECTION_DELETED` (`scim.connection.deleted`): `DELETE /settings/organization/scim-connection`. The plugin decommissions the connection, the membership projection removes every member the directory provisioned (owners excepted), and each removal is reported as an `org.member.removed` by the owner who disconnected.
- `SCIM_USER_CREATED` (`scim.user.created`): public. `POST /scim/v2/Users`.
- `SCIM_USER_UPDATED` (`scim.user.updated`): public. `PUT`/`PATCH` that does not turn an active user inactive. Payload carries `changedFields` (`changedFieldsFrom(body)`: PATCH `Operations[].path`, or top-level PUT keys minus `schemas`).
- `SCIM_USER_DEACTIVATED` (`scim.user.deactivated`): public. `PUT`/`PATCH` after which a user who was active is not (`scimUserChange`, comparing the `scim_user` row snapshotted in `hooks.before` with the one read back after).
- `SCIM_USER_DEPROVISIONED` (`scim.user.deprovisioned`): public. `DELETE`. **This removes only the `member` row for the owning org**: the global `user` row (and any other org membership) is untouched. A SCIM deprovision is an org departure, not an account deletion; it does not route through the RGPD grace-period wipe.

Membership itself is written by the SCIM membership projection (`apps/api/src/shared/auth/scim-membership.ts`) inside the plugin's transaction, so no organization hook fires: the SCIM after-hook reads the member row back and emits `org.member.joined` or `org.member.removed` itself.

## Payload validation guarantee

Every `outbox.enqueue(...)` call validates each event against `PayloadByEventType[eventType]` via Zod `safeParse` **before** the INSERT. A failure throws, which rolls back the surrounding TX (UoW or BetterAuth hook). **Why**: the audit trail is only as good as the payloads it stores: a missing `actorUserId`, an extra field, a wrong type silently corrupts compliance. Failing the mutation forces the bug to surface at the call site, atomically (the business write and the bad event are rejected together, never half-applied).

Symptoms when this guard fires:
- `outbox: unknown event type "X"`: emitter passed an event type not registered in `PayloadByEventType` (forgot step 2 of "How to emit").
- `outbox: payload validation failed for "X": ...`: payload shape drifted from the Zod schema (typo, missing required field, wrong type). The Zod error message points to the offending key.

The guard lives in `DrizzleOutboxRepository.enqueue` (the single porte d'entrée : covers `emitEvent(...)` helper and aggregate-driven flushes uniformly).

## Hard rules

- **A nested `uow.run()` joins the open transaction.** No savepoint, no second connection: its events wait for the outermost flush, and a failed `Result` at any depth rolls the whole unit back (the outermost `run()` resolves to that failure). A promise that outlives its run reads the pool through `resolveExecutor()`, never the finished transaction.
- **`addEvent()` outside `uow.run()` = events lost.** The `EventCollector` ALS context is created by `uow.run()`. If you emit events in code that doesn't go through `uow.run()`, they stay on the aggregate buffer and never reach the outbox. A dev-mode warning is logged via `EventCollector.setOutOfContextLogger()` (wired in `apps/api/src/index.ts`).
- **A failing handler is retried alone.** A throw, a failed `Result` or a timeout names the handler in `last_error`, keeps the others in `deliveries` and retries the event with jitter; nothing the other handlers wrote is rolled back. Every handler is idempotent on the event id, and none swallows or captures its own failure.
- **Payloads validated at enqueue.** A payload that doesn't match its Zod schema in `PayloadByEventType` throws inside the outbox `INSERT`, rolling back the surrounding TX. The business write fails with the bad payload, never apply one without the other.

## Known limitations

- **BetterAuth race window**: `databaseHooks` emit events post-COMMIT BetterAuth, hors outbox TX. A process crash between BetterAuth COMMIT and `outbox.enqueue` loses the event. No 2PC primitive available. For SOC2-strict reconciliation: cron query `SELECT u.id FROM "user" u LEFT JOIN outbox_event o ON o.aggregate_id = u.id AND o.event_type = 'user.created' WHERE o.id IS NULL`.
- **`USER_EMAIL_VERIFIED` skipped when session not yet propagated**: the BetterAuth `/verify-email` handler can run before auto-sign-in commits, leaving `ctx.context.session` null. Workaround: poll a periodic reconciliation, or wait for BetterAuth to expose `userId` from the verification token.
- **`/passkey/*register*` fuzzy match was wrong**: current code uses exact path `/passkey/verify-registration` (the only path that writes to DB). Path matching against BetterAuth internals is fragile; if BetterAuth renames a route in a minor version, the bridge silently no-ops. Mitigation: integration test that exercises the real HTTP endpoint and asserts the event lands.
- **Tamper-evidence**: `prev_hash`/`hash` columns posed in `audit_log` but calculation off (`AUDIT_TAMPER_EVIDENCE=false`). Implementation (Merkle batch or hash chain with row-lock) deferred until SOC2 audit demands it.
- **UUID v7 ordering**: monotonic across milliseconds, not strict within the same ms. Sufficient for B-tree locality, not for global causal ordering.
- **In-process workers**: `OutboxDispatcher` and `WebhookDeliveryWorker` run inside the API process. Above ~500 events/s sustained, extract to a separate `bun` process pointing at the same DB: the lease makes several relays safe side by side.
- **Rolling deploy of the queue lease**: an old process still running the previous email or webhook worker settles without the `attempts` guard for about one lease (120 s, 330 s), so an in-flight row can end with `attempts` off by one. Accepted: the next claim corrects it.
- **SIGTERM grace**: `OutboxDispatcher.stop()` waits for the running drain, then abandons handlers still in flight after its grace; their events are claimed again once the lease expires, so a handler can run twice across a restart. Receivers must honor `x-webhook-idempotency` to dedupe potential double-POSTs.

## Files of reference

| Path | Role |
|---|---|
| `packages/events/src/{event-types,payloads,retention-map}.ts` | Central catalog (92 events: 35 public + 57 internal) |
| `packages/events/src/visibility-map.ts` | Allowlist: `"public"` = customer contract, `"internal"` = operational signal. Drives fanout, picker, and public catalog simultaneously. |
| `packages/events/src/{descriptions,json-schema}.ts` | Human-readable descriptions + `jsonSchemaForEvent` (Zod 4 `z.toJSONSchema`): consumed by public catalog + `EventTypePicker` |
| `packages/ddd-kit/src/events/{event-collector,on-event,outbox-mapping}.ts` | ALS collector + handler factory + CloudEvents mapping |
| `packages/drizzle/src/schema/{outbox,audit-log,webhooks}.ts` | The 4 tables |
| `packages/drizzle/src/services/transaction-manager.service.ts` | `TransactionService.run()`: ALS flush + nested runs joining the outermost transaction + rollback when the callback resolves to a failed `Result` |
| `packages/drizzle/src/repositories/track-events.ts` | `trackEventsOnSuccess()` repo helper |
| `apps/api/src/shared/services/outbox-dispatcher.service.ts` | LISTEN/NOTIFY worker, wake schedule, start and stop |
| `apps/api/src/shared/services/outbox-relay.ts` | Claim by lease, run the named handlers, settle, dead announcement |
| `apps/api/src/shared/services/drizzle-outbox.service.ts` | Outbox repository: enqueue, claim, `pendingState`, `markDelivered`, `markFailed` |
| `apps/api/src/shared/event-handlers.ts` | Subscribes the built-in handlers to every catalog type, then the discovered `onEvent` handlers |
| `apps/api/src/shared/services/audit-event-subscriber.ts` | Built-in `audit-log` handler |
| `apps/api/src/shared/services/webhook-fanout-subscriber.ts` | Built-in `webhook-fanout` handler (org-scoped) |
| `apps/api/src/modules/webhooks/infrastructure/services/webhook-delivery-worker.service.ts` | HMAC POST + claim window + retry |
| `apps/api/src/shared/aead.ts` | AEAD encrypt/decrypt for webhook secrets |
| `apps/api/src/shared/jitter.ts` | Decorrelated jitter math |
| `apps/api/src/shared/event-emitter.ts` | `emitEvent()` shared helper (used by RGPD, uploads, BetterAuth bridge) |
| `apps/api/src/auth.ts` | BetterAuth bridge (23 events: 15 user + 8 org) |
| `apps/api/src/modules/{audit-log,webhooks}/` | Built-in modules (admin routes + worker) |
