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
  userId: z.string(),       // subject (whose order)
  actorUserId: z.string(),  // who placed it — REQUIRED when actor ≠ subject (admin places on behalf, system bot, etc.)
  total: z.number().positive(),
});
export type OrderPlacedPayload = z.infer<typeof OrderPlacedPayload>;

// don't forget to add it to PayloadByEventType at the bottom
[EventTypes.ORDER_PLACED]: OrderPlacedPayload,
```

> **Actor identification (rule #7 of root CLAUDE.md).** `AuditEventSubscriber.extractActor` scans the payload for the actor in priority order: `actorUserId` → `inviterUserId` → `ownerUserId` → `userId`. **`userId` is the subject, not the actor by default.** When the actor differs from the subject (admin kicks member, system cron processes deletion, owner changes someone else's role), `actorUserId` must be a separate, NOT NULL field. Self-actor flows (sign-in, MFA toggle, self-deletion) can rely on `userId` alone. A row landing in `audit_log` with `actor_type="system"` should be the exception, not a default — the runtime guard at `enqueue` catches a missing/wrong-shape payload, but it can't catch a *semantically* missing actor: that's on the schema author.

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

## Retention

Three sweep endpoints purge derived tables. All gated by `internalLayers` (HMAC), called by an external cron via `signedInternalFetch`. Defaults reflect SOTA 2026 research, configurable via env knobs.

| Table | Knob | Default | Filter | Conformance source |
|---|---|---|---|---|
| `outbox_event` | `OUTBOX_RETENTION_DAYS` | **7d** | `dispatched_at IS NOT NULL AND dispatched_at < cutoff` | NServiceBus / industry consensus 2025 — debug window |
| `audit_log` (operational) | `AUDIT_LOG_OPERATIONAL_RETENTION_DAYS` | **90d** | `retention = 'operational' AND occurred_at < cutoff` | SOC2 minimum-safe (operational logs); RGPD minimisation |
| `audit_log` (compliance) | `AUDIT_LOG_COMPLIANCE_RETENTION_DAYS` | **365d** | `retention = 'compliance' AND occurred_at < cutoff` | SOC2 Type II ≥ 12 months; PCI-DSS 10.7; NIS2 baseline |
| `webhook_delivery` | `WEBHOOK_DELIVERY_RETENTION_DAYS` | **30d** | `status IN ('success','dead_letter') AND created_at < cutoff` | Stripe / GitHub / Hookdeck convergence |

Notes:
- **`pending` and `failed` webhook deliveries are NEVER purged automatically** — they signal worker death or active retry. A `pending` row stale > 24h must page on-call, not be cleaned up.
- **`retention = 'none'`** rows never reach the DB. `AuditEventSubscriber` returns early when `retentionFor(eventType) === "none"` — uncatalogued events are never written.

### Endpoints

- `POST /internal/sweep-outbox` — body `{ batchSize?: 1–50000 (default 5000), dryRun?: boolean }` → `{ deleted, durationMs, dryRun, batchCount }`
- `POST /internal/sweep-audit-log` — same body → `{ deletedPerBucket: { operational, compliance }, durationMs, dryRun }`
- `POST /internal/sweep-webhook-delivery` — same body → `{ deleted, durationMs, dryRun, batchCount }`

Each endpoint runs a batched `DELETE ... WHERE id IN (SELECT id ... ORDER BY <ts> LIMIT N FOR UPDATE SKIP LOCKED)` inside a transaction with `SET LOCAL statement_timeout = '5s'`, `lock_timeout = '500ms'`, `idle_in_transaction_session_timeout = '10s'`. Loops until 0 rows; hard-capped at 1000 batches per call.

### Order matters (FK constraint)

`webhook_delivery.outbox_event_id` is `ON DELETE RESTRICT`. The cron must run sweeps in this order:

1. `POST /internal/sweep-webhook-delivery` — frees terminal deliveries
2. `POST /internal/sweep-audit-log` — independent
3. `POST /internal/sweep-outbox` — last, otherwise `outbox_event` rows still referenced by undeleted deliveries trigger an FK violation

### Cron chain entrypoint

The chained sweep runner lives at `apps/api/src/cron/sweep.ts` — single source of truth, bundled by `bun build` into `dist/cron/sweep.js`. Reads `API_URL` and `INTERNAL_SIGNING_KEY` from env, hits the three endpoints in FK order, exits non-zero on first failure.

Runtime invocation (the same binary works in any orchestrator):

```bash
API_URL=https://api.example.com \
INTERNAL_SIGNING_KEY=<hex32+> \
  bun dist/cron/sweep.js
```

**Railway Cron** (reference deploy — see [`DEPLOY-RAILWAY.md`](DEPLOY-RAILWAY.md)) configures this via `infra/railway/cron.toml`: `startCommand = "bun dist/cron/sweep.js"`, `cronSchedule = "17 3 * * *"`, `restartPolicyType = "NEVER"`. The cron service reuses the api Docker image — no extra Dockerfile.

For other orchestrators (Fly Machines `--schedule`, Render Cron Job, Cloud Scheduler → Cloud Run job, K8s CronJob), point the entrypoint at the same `bun dist/cron/sweep.js` command and pass the two env vars. The signature primitives (`signedInternalFetch` with object input — see `apps/api/src/shared/internal-routes/internal-fetch.ts`) are platform-agnostic.

## Setup checklist post-clone

1. Tables (`outbox_event`, `audit_log`, `webhook_endpoint`, `webhook_delivery`) are created automatically — the api runs `drizzle migrate` at boot before `OutboxDispatcher.start()` (`apps/api/src/migrate.ts`). In native dev, `pnpm db:migrate` once before `pnpm dev` if you skipped Docker.
2. Set env vars in `apps/api/.env`:
   - `WEBHOOK_MASTER_KEY=<64 hex chars>` — generate via `openssl rand -hex 32` (required in production)
   - `AUDIT_TAMPER_EVIDENCE=false` — leave off; flip to `true` only when SOC2 audit demands hash chain

## Operational endpoints

- `GET /admin/audit-log` — list audit events for active org. Permission: `auditLog: ["read"]`. `organizationId` always derived from session, never query string.
- `POST /internal/sweep-{outbox,audit-log,webhook-delivery}` — retention sweeps (see § Retention above). Internal-gated (HMAC signature + optional private network).
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
- **CloudEvents 1.0 envelope** stored in `outbox_event.metadata` (specversion, source, subject, traceparent, requestId) for cross-system interop. **`requestId`** carries the request's `X-Request-Id` — captured via an `AsyncLocalStorage` request context (`shared/request-context.ts`) at enqueue time, then copied into `audit_log.request_id` by the audit subscriber, so every audit row joins back to its originating HTTP request, pino logs, and Sentry event. (`traceparent` stays reserved for W3C trace context — Phase D.1 OTel.)

## BetterAuth bridge — what fires what

The boilerplate emits **47 events automatically** (23 from `apps/api/src/auth.ts` covering BetterAuth lifecycles, 5 from `modules/rgpd/`, 3 from `modules/uploads/`, 3 from `modules/webhooks/`, 1 from `modules/policies/`, **2 from `modules/consents/`**, 5 from security — 3 middleware/endpoint + 2 abuse-prevention hooks in `auth.ts`, **4 from `modules/billing/`**, **1 from quota middleware**). Source of truth: `packages/events/src/event-types.ts`.

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
- `USER_PROFILE_UPDATED` — `path === "/update-user"`. Payload: `{ userId, changes }` (field-level diff).
- `USER_ACCOUNT_LINKED` — `path === "/link-social"` + lookup latest non-credential account created < 5s ago

### Via BetterAuth callbacks (native)
- `USER_PASSWORD_RESET_REQUESTED` — `emailAndPassword.sendResetPassword`
- `USER_PASSWORD_CHANGED` — `emailAndPassword.onPasswordReset`
- `USER_MAGIC_LINK_REQUESTED` — `magicLink.sendMagicLink`
- `USER_EMAIL_CHANGE_REQUESTED` — `user.changeEmail.sendChangeEmailConfirmation`. Payload: `{ userId, newEmail }`. Confirmation sent to the **current** address.

### Via `organizationHooks` (org plugin)
- `ORG_CREATED` (afterCreateOrganization) · `ORG_UPDATED` · `ORG_DELETED` · `ORG_MEMBER_INVITED` (afterCreateInvitation) · `ORG_INVITATION_CANCELLED` · `ORG_MEMBER_REMOVED` (afterRemoveMember) · `ORG_MEMBER_ROLE_CHANGED` (afterUpdateMemberRole)
- `ORG_MEMBER_JOINED` fires from **two** hooks: `afterAddMember` (direct add — org-create creator + signup auto-personal-org) **and** `afterAcceptInvitation` (member joins via invite). The two lifecycles are independent in BetterAuth — wiring only one would silently drop the other path.

### Via RGPD service
- `USER_DELETION_{REQUESTED,CANCELLED}` · `USER_DELETED` · `USER_EXPORT_{REQUESTED,COMPLETED}` (payload contains `storageKey`, **not** the presigned URL — security)

### Via UploadService
- `UPLOAD_REQUESTED` · `UPLOAD_CONFIRMED` · `UPLOAD_DELETED` (payload uses `hashKey(key)` — sha256 truncated, never the raw filename — PII protection)

### Via WebhooksService
- `WEBHOOK_ENDPOINT_CREATED` · `WEBHOOK_ENDPOINT_UPDATED` · `WEBHOOK_ENDPOINT_DELETED` (payload carries `actorUserId` propagated from the HTTP boundary — `c.get("user").id`)

### Via `PolicyAcceptanceService` (Phase A.2)
- `USER_POLICY_ACCEPTED` (`user.policy.accepted`) — payload `{ userId, policyType, policyVersion, ipAddress? }`, retention `compliance`. Self-actor: `userId` resolves as the actor via `AuditEventSubscriber.extractActor`. Emitted from `PolicyAcceptanceService.accept`, which is called from **two sites**: (1) the BetterAuth `/verify-email` after-hook in `auth.ts` (sign-up path, idempotent via `getStaleTypes`) and (2) the `POST /me/policies/accept` route (explicit re-acceptance by already-authenticated users).

### Via `ConsentService` (Phase A.4)

- `USER_COOKIE_CONSENT_GRANTED` (`user.cookie_consent.granted`) — émis par `ConsentService.record` à chaque sauvegarde. Payload : `{ subjectId: string (device cookie), userId?: string (null pour guests), categories: ConsentCategory[], policyVersion: string, ipAddress?, userAgent? }`, retention `compliance`. L'`actorUserId` résout sur `userId` quand l'utilisateur est connecté (self-actor) ; `null` pour un guest (le `subjectId` est la seule identité disponible). Les guests obtiennent un record réconcilié au login via `ConsentService.reconcile` (hook `hooks.after` + `ctx.context.newSession`).
- `USER_COOKIE_CONSENT_WITHDRAWN` (`user.cookie_consent.withdrawn`) — émis par `ConsentService.withdraw`. Même shape de payload. Retention `compliance`.

### Via security middleware / endpoint (Phase C.1)

Ces 3 events ne sont pas des state-changes métier — ils signalent des rejets de sécurité au niveau infra. Émis via `emitEvent(outbox, ...)` **hors agrégat** (même chemin que les events RGPD/uploads/webhooks), avec `actorUserId` **nullable** (pas de session authentifiée fiable sur ces rejets).

- `SECURITY_RATE_LIMIT_EXCEEDED` (`security.rate_limit.exceeded`) — émis par le rate-limit middleware sur rejet d'une requête auth. Payload : `{ actorUserId: string | null, ip: string (max 45), policyName: string (max 64), path: string (max 512), method: string (max 16) }`, retention `operational`.
- `SECURITY_CSP_VIOLATION` (`security.csp.violation`) — émis par l'endpoint public `POST /csp-report`. Payload : `{ documentUri, violatedDirective, blockedUri, actorUserId? }`, retention `operational`.
- `SECURITY_CSRF_REJECTED` (`security.csrf.rejected`) — émis par le CSRF middleware sur Origin invalide. Payload : `{ ipAddress, path, origin?, actorUserId? }`, retention `operational`.

### Via abuse-prevention hooks (Phase C.1 s5a, `auth.ts` `hooks.before`)

Émis via `emitEvent(outbox, ...)` dans le `hooks.before` BetterAuth, juste avant le rejet (`throw APIError`). **Piège BetterAuth** : dans un `hooks.before`, `ctx.context.request` et `ctx.context.session` sont **`undefined`** (le before-hook global tourne avant le session-middleware) — l'IP se lit sur `ctx.headers`, et l'actor authentifié (`/change-password`) via `auth.api.getSession({ headers: ctx.headers })`. Câbler sur `ctx.context.*` fait throw le calcul d'IP avant l'emit → event perdu silencieusement (les tests unitaires ne montent pas les hooks, seule une passe end-to-end le révèle).

- `SECURITY_SIGNUP_REJECTED` (`security.signup.rejected`) — émis sur blocage d'un email jetable au sign-up. Payload : `{ actorUserId: null, email: string (max 254), ip: string | null, reason: "disposable_email" }`, retention `operational`.
- `SECURITY_PASSWORD_BREACHED` (`security.password.breached`) — émis sur un mot de passe compromis HIBP au sign-up / reset / change-password (le rejet 422 vient déjà de la NIST policy). Payload : `{ actorUserId: string | null, email: string | null, ip: string | null, path }` — `actorUserId`/`email` portés par la session réelle sur `/change-password`, `null` sur sign-up/reset (pas de session). Retention `operational`.

### Via subscription events (`auth.ts` `@better-auth/stripe` callbacks — Phase B.1)

Emitted via `emitEvent(outbox, ...)` inside the `@better-auth/stripe` plugin callbacks wired in `apps/api/src/auth.ts` (`onSubscriptionComplete`, `onSubscriptionUpdate`, and the `onEvent` invoice.payment_failed handler). These are Stripe-originated lifecycle events — not triggered by a user HTTP request, so `actorUserId` is nullable (the Stripe webhook arrives on behalf of the org with no authenticated session). Subscription state SSOT is the plugin `subscription` table; these events are the compliance + operational audit trail on top of it.

- `BILLING_SUBSCRIPTION_CREATED` (`billing.subscription.created`) — emitted on `customer.subscription.created` Stripe webhook (first active subscription for an org). Payload: `{ organizationId, subscriptionId, tier, status, actorUserId: null, currentPeriodEnd }`, retention `compliance`.
- `BILLING_SUBSCRIPTION_UPDATED` (`billing.subscription.updated`) — emitted on `customer.subscription.updated` when the new status is not terminal. Same payload shape as `created`, retention `compliance`.
- `BILLING_SUBSCRIPTION_CANCELLED` (`billing.subscription.cancelled`) — emitted on `customer.subscription.updated` when status is `canceled` / `incomplete_expired` / `unpaid`. Payload: `{ organizationId, subscriptionId, tier, status, actorUserId: null }`, retention `compliance`.
- `BILLING_PAYMENT_FAILED` (`billing.payment.failed`) — emitted on `invoice.payment_failed` Stripe webhook. Payload: `{ organizationId, subscriptionId, invoiceId, actorUserId: null }`, retention `compliance` (kept long-term as part of the billing/financial audit trail — the whole `billing.*` family is `compliance` so there is no retention divergence within it).

**Status mapping** — `subscriptionEventType(status)` in `apps/api/src/modules/billing/application/subscription-events.ts` maps Stripe subscription statuses to the three state events: `canceled` / `incomplete_expired` / `unpaid` → `BILLING_SUBSCRIPTION_CANCELLED`; all other statuses → `BILLING_SUBSCRIPTION_UPDATED`. `BILLING_SUBSCRIPTION_CREATED` fires only on the initial `customer.subscription.created` webhook path.

### Via `requireQuota` middleware (Phase B.2)

Emitted via `emitEvent(outbox, ...)` in `requireQuota` when a request hits a quota ceiling. The middleware runs before the business handler; if the quota is already at or above the limit, it returns `429 BILLING_QUOTA_EXCEEDED` and emits the event. **`reserveQuota` (the authoritative in-TX check) does NOT emit this event** — it only calls `assertQuota` which throws. A caller enforcing via `reserveQuota` inside `uow.run()` without the middleware must emit the event themselves if they want the telemetry (or mount `requireQuota` on the route).

- `BILLING_QUOTA_EXCEEDED` (`billing.quota.exceeded`) — emitted on quota ceiling hit. Payload: `{ organizationId, resource: string, limit: number, attempted: number, tier: string, actorUserId: string }`, retention `operational`.

## Payload validation guarantee

Every `outbox.enqueue(...)` call validates each event against `PayloadByEventType[eventType]` via Zod `safeParse` **before** the INSERT. A failure throws, which rolls back the surrounding TX (UoW or BetterAuth hook). **Why**: the audit trail is only as good as the payloads it stores — a missing `actorUserId`, an extra field, a wrong type silently corrupts compliance. Failing the mutation forces the bug to surface at the call site, atomically (the business write and the bad event are rejected together, never half-applied).

Symptoms when this guard fires:
- `outbox: unknown event type "X"` — emitter passed an event type not registered in `PayloadByEventType` (forgot step 2 of "How to emit").
- `outbox: payload validation failed for "X": ...` — payload shape drifted from the Zod schema (typo, missing required field, wrong type). The Zod error message points to the offending key.

The guard lives in `DrizzleOutboxRepository.enqueue` (the single porte d'entrée — covers `emitEvent(...)` helper and aggregate-driven flushes uniformly).

## Hard rules

- **`uow.run()` cannot be nested.** Drizzle nested `db.transaction()` opens independent TXs (not savepoints). The `TransactionService.run()` throws if `EventCollector.hasContext()` is already true. Refactor your code to a single outer `uow.run()`.
- **`addEvent()` outside `uow.run()` = events lost.** The `EventCollector` ALS context is created by `uow.run()`. If you emit events in code that doesn't go through `uow.run()`, they stay on the aggregate buffer and never reach the outbox. A dev-mode warning is logged via `EventCollector.setOutOfContextLogger()` (wired in `apps/api/src/index.ts`).
- **Built-in subscriber failures roll back the dispatch.** Audit writer or webhook fanout throwing → the entire batch's TX rolls back, events retried at next drain with backoff. Make sure built-in subscribers stay deterministic.
- **Payloads validated at enqueue.** A payload that doesn't match its Zod schema in `PayloadByEventType` throws inside the outbox `INSERT`, rolling back the surrounding TX. The business write fails with the bad payload — never apply one without the other.

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
| `packages/events/src/{event-types,payloads,retention-map}.ts` | Central catalog (47 events) |
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
| `apps/api/src/auth.ts` | BetterAuth bridge (23 events: 15 user + 8 org) |
| `apps/api/src/modules/{audit-log,webhooks}/` | Built-in modules (admin routes + worker) |
