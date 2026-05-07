# Event-driven foundation — DX guide

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

### Going serverless — three paths

If you must ship on serverless functions, the rail still works — you swap the dispatcher only:

1. **Cron-triggered drain** (lowest effort). Expose a protected `POST /internal/drain-outbox` (gated by the same HMAC layer as `/internal/rgpd-sweep`) that runs one batch of `findPendingBatch` + subscribers. Trigger every 1-5 min via Vercel Cron / GitHub Actions / Inngest scheduled function. **Trade-off**: latency floor = cron interval (1 min on Vercel free, 30 s on Inngest).
2. **External queue** (lowest latency). Replace `outbox.enqueue()` with a push to SQS / Inngest / QStash inside the same TX (XA-style two-phase, or accept the well-known race window). The queue invokes a serverless function per message.
3. **Hybrid** (most pragmatic). Keep the api serverless, deploy a tiny worker container alongside (Railway/Fly, ~5 €/mo) running the existing `OutboxDispatcher` + `WebhookDeliveryWorker`. Pointing it at the same `DATABASE_URL` is enough; no other code changes.

The audit/webhook subscribers, the catalogue, the `uow.run` flush — all unchanged in any path. Only `OutboxDispatcher` swaps.

## Mental model

```
your code           ─►  uow.run(async tx => repo.save(aggregate, tx))
                                          │
                                          ▼ ALS collector flushes pre-COMMIT
                                  outbox_event INSERT (same TX)
                                          │
                                          ▼ pg_notify post-COMMIT
                                  OutboxDispatcher (in-process Bun worker)
                                          │
                       drain via SELECT ... FOR UPDATE SKIP LOCKED
                                          │
        ┌─── built-in (TX-bound) ─────────┼─────── post-commit (best-effort) ──┐
        ▼                                 ▼                                    ▼
  AuditEventSubscriber          WebhookFanoutSubscriber              user-defined handlers
  → audit_log row               → webhook_delivery rows              (auto-discovered via
  (idempotent via               (HMAC POST → consumers via            EVENT_HANDLER_SYMBOL)
  audit-${eventId})             WebhookDeliveryWorker)
```

**Key invariant**: built-in subscribers run inside the same DB transaction as `markDispatched` — atomic. User handlers run **post-commit**, best-effort, isolated from each other (one handler throwing doesn't fail the outbox dispatch).

## How to emit a new event

**Step 1** — declare the type in `packages/events/src/event-types.ts`:

```ts
export const EventTypes = {
  // ...
  ORDER_PLACED: "order.placed",
} as const;
```

**Step 2** — declare the Zod payload in `packages/events/src/payloads.ts`:

```ts
export const OrderPlacedPayload = z.object({
  orderId: z.string(),
  userId: z.string(),
  total: z.number().positive(),
});
export type OrderPlacedPayload = z.infer<typeof OrderPlacedPayload>;

// don't forget to add it to PayloadByEventType at the bottom
[EventTypes.ORDER_PLACED]: OrderPlacedPayload,
```

**Step 3** — set retention in `packages/events/src/retention-map.ts`:

```ts
[EventTypes.ORDER_PLACED]: "compliance",  // or "operational" / "none"
```

**Step 4** — define the event class + emit from your aggregate:

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

**Step 5** — persist in a use-case via `uow.run()`:

```ts
class PlaceOrderUseCase {
  constructor(
    private readonly uow: IUnitOfWork<ITransaction>,
    private readonly repo: IOrderRepository,
  ) {}

  async execute(input: PlaceOrderInput): Promise<Result<Order, OrderError>> {
    return this.uow.run(async (tx) => {
      const order = Order.place(input);
      return this.repo.save(order, tx);
    });
  }
}
```

That's it. The event is in `outbox_event` (same TX as the order row), `audit_log` row written automatically, every matching `webhook_endpoint` receives a `webhook_delivery`.

> **Repos must opt into auto-tracking.** In your repo `save()`/`create()` impl, return `trackEventsOnSuccess(result, aggregate)` (helper in `@packages/drizzle`) — that pushes pulled events into the ALS collector. Without it, events stay buffered on the aggregate and are silently lost.

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
    onEvent(EventTypes.ORDER_PLACED, (c) => async (event) => {
      await c.IEmailService.sendTemplate("order_confirmation", ...);
    }),
  ),
);
```

`OutboxDispatcher.start()` discovers it automatically at boot via `Object.entries(di)` + `EVENT_HANDLER_SYMBOL` marker. **No registration array, no manifest.**

## Built-in audit & webhook coverage

If your event is in `RETENTION_MAP` with `operational` or `compliance`:
- `audit_log` row written by `AuditEventSubscriber` inside the dispatch TX (idempotent via `audit-${eventId}` deterministic ID + `ON CONFLICT DO NOTHING`).
- Every enabled `webhook_endpoint` matching `eventTypes ? <type>` AND `organizationId = event.organizationId` receives a `webhook_delivery` row, dispatched independently by `WebhookDeliveryWorker` (HMAC POST + retry + dead-letter).

> **Multi-tenant safety**: events with `organizationId = null` (platform-level: `user.created`, `user.signed_in`, etc.) **skip webhook fanout entirely** — never broadcast across tenants.

## Setup checklist post-clone

1. `pnpm db:push` (creates `outbox_event`, `audit_log`, `webhook_endpoint`, `webhook_delivery`)
2. Set env vars in `apps/api/.env`:
   - `WEBHOOK_MASTER_KEY=<64 hex chars>` — generate via `openssl rand -hex 32` (required in production)
   - `AUDIT_TAMPER_EVIDENCE=false` — leave off; flip to `true` only when SOC2 audit demands hash chain

## Operational endpoints

- `GET /admin/audit-log` — list audit events for active org. Permission: `auditLog: ["read"]`. `organizationId` always derived from session, never query string.
- `POST /internal/audit-log-purge` — sweep `operational` rows older than N days. Body: `{ olderThanDays?: number, dryRun?: boolean }`. Internal-gated (HMAC signature + optional private network).
- `GET/POST/PATCH/DELETE /settings/webhooks` — manage endpoints. Permission: `webhooks: ["read"|"write"]`. Plaintext secret returned **once at creation** (Stripe-style), never re-exposed.
- `GET /settings/webhooks/:id/deliveries` — list deliveries with status filter (`?status=pending|success|failed|dead_letter`).
- `POST /settings/webhooks/:id/deliveries/:deliveryId/replay` — re-enqueue a past delivery with fresh idempotency key.

## HMAC signature format (for receivers)

Header: `x-webhook-signature: t=<unix>,v1=<hex-sha256>`. Signed payload: `${timestamp}.${rawBody}`. Body shape: `{ id, type, data, time }` (CloudEvents-aligned).

Reject if timestamp drift > 5 min (replay protection). Use the `x-webhook-idempotency` header (`<eventId>:<endpointId>`) to dedupe on your side.

```ts
// Receiver verification
const sigHeader = req.headers["x-webhook-signature"];
const [tsPart, sigPart] = sigHeader.split(",");
const ts = Number(tsPart.split("=")[1]);
const sig = sigPart.split("=")[1];
const expected = hmacSha256(`${ts}.${rawBody}`, secret);
if (!timingSafeEqual(sig, expected)) return reject(401);
if (Math.abs(Date.now() / 1000 - ts) > 300) return reject(401);
```

## Architecture choices (SOTA 2026)

- **UUID v7** for `outbox_event.id`, `audit_log.id`, `webhook_*.id` — time-ordered, B-tree locality preserved on inserts.
- **Postgres LISTEN/NOTIFY** via dedicated `pg.Client` (hors pool Drizzle) + **30s poll fallback** for connection drops. Trigger ensured at boot via idempotent `CREATE OR REPLACE TRIGGER` (Postgres 14+ atomic).
- **`SELECT ... FOR UPDATE SKIP LOCKED`** drain — multi-instance safe out of the box.
- **`SET LOCAL idle_in_transaction_session_timeout = '30s'`** at the start of every drain TX — zombie workers can't lock rows indefinitely.
- **AEAD secret encryption** (`@noble/ciphers` XChaCha20-Poly1305 + HKDF-SHA256 per-org sub-key) for webhook secrets at rest.
- **Decorrelated jitter** retry (`apps/api/src/shared/jitter.ts`) — `BASE * MULTIPLIER^attempts` then `random(BASE, upper)` clamped to 12h cap. Dead-letter after 5 attempts.
- **Claim window pattern** in delivery worker — claim a batch with `next_attempt_at = now() + (BATCH_SIZE × FETCH_TIMEOUT + buffer)`, fetch HTTP **outside** the TX, update status in a fresh TX. Prevents lock starvation.
- **CloudEvents 1.0 envelope** stored in `outbox_event.metadata` (specversion, source, traceparent) for cross-system interop.

## BetterAuth bridge — what fires what

The boilerplate emits **29 events automatically** (21 from `apps/api/src/auth.ts` covering BetterAuth lifecycles, 5 from `modules/rgpd/`, 3 from `modules/uploads/`). Source of truth: `packages/events/src/event-types.ts`.

### Via `databaseHooks` (TX-bound, captures all flows)
- `USER_CREATED` — `databaseHooks.user.create.after`
- `USER_SIGNED_IN` — `databaseHooks.session.create.after`
- `USER_SIGNED_OUT` — `databaseHooks.session.delete.after`
- `USER_ACCOUNT_UNLINKED` — `databaseHooks.account.delete.after` (skip credential)

### Via `hooks.after` + `createAuthMiddleware` (path-based, plugin events)
Filter: `if (ctx.context.returned instanceof APIError) return` (skip on 4xx/5xx).
- `USER_MFA_ENABLED` — `path === "/two-factor/enable"`
- `USER_MFA_DISABLED` — `path === "/two-factor/disable"`
- `USER_PASSKEY_ADDED` — `path === "/passkey/verify-registration"` + lookup latest passkey
- `USER_PASSKEY_REMOVED` — `path === "/passkey/delete-passkey"` + body.id
- `USER_EMAIL_VERIFIED` — `path === "/verify-email"` (skipped if session not yet active — limitation)
- `USER_PASSWORD_CHANGED` — `path === "/change-password"`
- `USER_ACCOUNT_LINKED` — `path === "/link-social"` + lookup latest non-credential account created < 5s ago

### Via BetterAuth callbacks (native)
- `USER_PASSWORD_RESET_REQUESTED` — `emailAndPassword.sendResetPassword`
- `USER_PASSWORD_CHANGED` — `emailAndPassword.onPasswordReset`
- `USER_MAGIC_LINK_REQUESTED` — `magicLink.sendMagicLink`

### Via `organizationHooks` (org plugin)
- `ORG_CREATED` (afterCreateOrganization) · `ORG_UPDATED` · `ORG_DELETED` · `ORG_MEMBER_INVITED` (afterCreateInvitation) · `ORG_INVITATION_CANCELLED` · `ORG_MEMBER_REMOVED` (afterRemoveMember) · `ORG_MEMBER_ROLE_CHANGED` (afterUpdateMemberRole)
- `ORG_MEMBER_JOINED` fires from **two** hooks: `afterAddMember` (direct add — org-create creator + signup auto-personal-org) **and** `afterAcceptInvitation` (member joins via invite). The two lifecycles are independent in BetterAuth — wiring only one would silently drop the other path.

### Via RGPD service
- `USER_DELETION_{REQUESTED,CANCELLED}` · `USER_DELETED` · `USER_EXPORT_{REQUESTED,COMPLETED}` (payload contains `storageKey`, **not** the presigned URL — security)

### Via UploadService
- `UPLOAD_REQUESTED` · `UPLOAD_CONFIRMED` · `UPLOAD_DELETED` (payload uses `hashKey(key)` — sha256 truncated, never the raw filename — PII protection)

## Hard rules

- **`uow.run()` cannot be nested.** Drizzle nested `db.transaction()` opens independent TXs (not savepoints). The `TransactionService.run()` throws if `EventCollector.hasContext()` is already true. Refactor your code to a single outer `uow.run()`.
- **`addEvent()` outside `uow.run()` = events lost.** The `EventCollector` ALS context is created by `uow.run()`. If you emit events in code that doesn't go through `uow.run()`, they stay on the aggregate buffer and never reach the outbox. A dev-mode warning is logged via `EventCollector.setOutOfContextLogger()` (wired in `apps/api/src/index.ts`).
- **Built-in subscriber failures roll back the dispatch.** Audit writer or webhook fanout throwing → the entire batch's TX rolls back, events retried at next drain with backoff. Make sure built-in subscribers stay deterministic.

## Known limitations

- **BetterAuth race window**: `databaseHooks` emit events post-COMMIT BetterAuth, hors outbox TX. A process crash between BetterAuth COMMIT and `outbox.enqueue` loses the event. No 2PC primitive available. For SOC2-strict reconciliation: cron query `SELECT u.id FROM "user" u LEFT JOIN outbox_event o ON o.aggregate_id = u.id AND o.event_type = 'user.created' WHERE o.id IS NULL`.
- **`USER_EMAIL_VERIFIED` skipped when session not yet propagated** — the BetterAuth `/verify-email` handler can run before auto-sign-in commits, leaving `ctx.context.session` null. Workaround: poll a periodic reconciliation, or wait for BetterAuth to expose `userId` from the verification token.
- **`/passkey/*register*` fuzzy match was wrong** — current code uses exact path `/passkey/verify-registration` (the only path that writes to DB). Path matching against BetterAuth internals is fragile; if BetterAuth renames a route in a minor version, the bridge silently no-ops. Mitigation: integration test that exercises the real HTTP endpoint and asserts the event lands.
- **Tamper-evidence**: `prev_hash`/`hash` columns posed in `audit_log` but calculation off (`AUDIT_TAMPER_EVIDENCE=false`). Implementation (Merkle batch or hash chain with row-lock) deferred until SOC2 audit demands it.
- **UUID v7 ordering**: monotonic across milliseconds, not strict within the same ms. Sufficient for B-tree locality, not for global causal ordering.
- **In-process workers**: `OutboxDispatcher` and `WebhookDeliveryWorker` run inside the API process. Above ~500 events/s sustained, extract to a separate `bun` process pointing at the same DB — the `IOutboxWorker { start, stop }` interface stays stable.
- **SIGTERM grace**: `stopWithTimeout` (25s per worker) — if a worker has in-flight work that exceeds the grace, the process exits anyway. Receivers must honor `x-webhook-idempotency` to dedupe potential double-POSTs.

## Files of reference

| Path | Role |
|---|---|
| `packages/events/src/{event-types,payloads,retention-map}.ts` | Central catalog (29 events) |
| `packages/ddd-kit/src/events/{event-collector,on-event,outbox-mapping}.ts` | ALS collector + handler factory + CloudEvents mapping |
| `packages/drizzle/src/schema/{outbox,audit-log,webhooks}.ts` | The 4 tables |
| `packages/drizzle/src/services/transaction-manager.service.ts` | `TransactionService.run()` — ALS flush + nested-run guard |
| `packages/drizzle/src/repositories/track-events.ts` | `trackEventsOnSuccess()` repo helper |
| `apps/api/src/shared/services/outbox-dispatcher.service.ts` | LISTEN/NOTIFY worker, drain, fan-out |
| `apps/api/src/shared/services/audit-event-subscriber.ts` | Built-in audit writer |
| `apps/api/src/shared/services/webhook-fanout-subscriber.ts` | Built-in webhook fanout (org-scoped) |
| `apps/api/src/modules/webhooks/infrastructure/services/webhook-delivery-worker.service.ts` | HMAC POST + claim window + retry |
| `apps/api/src/shared/aead.ts` | AEAD encrypt/decrypt for webhook secrets |
| `apps/api/src/shared/jitter.ts` | Decorrelated jitter math |
| `apps/api/src/shared/event-emitter.ts` | `emitEvent()` shared helper (used by RGPD, uploads, BetterAuth bridge) |
| `apps/api/src/auth.ts` | BetterAuth bridge (21 events: 13 user + 8 org) |
| `apps/api/src/modules/{audit-log,webhooks}/` | Built-in modules (admin routes + worker) |
