---
name: events-outbox
description: Use when working on domain events, the transactional outbox, the BetterAuth event bridge, event retention or sweeps. Trigger on "outbox", "domain event", "emitEvent", "addEvent", "uow.run", "OutboxDispatcher", "databaseHooks", "organizationHooks", "retention", "sweep". Not for audit-log querying or webhook consumer work.
---

# Events (transactional outbox)

`IUnitOfWork.run(cb)` opens an `EventCollector`. `repo.save(agg)` reads the ambient transaction and calls `EventCollector.collectFrom(agg)` once the write succeeded → events flushed via `outbox.enqueue` in the same TX (atomicity). `enqueue` also sends `pg_notify` on the same executor, so it leaves at commit and wakes `OutboxDispatcher`; its `OutboxRelay` claims due rows by lease (one statement, no transaction kept open) and runs every named handler not yet in the row's `deliveries` (built in `audit-log`, `webhook-fanout`, `notification-fanout`, plus each `onEvent(type, handlerName, ...)`), each in its own short transaction, then settles with `markDelivered` or `markFailed` guarded by the claimed `attempts`.

## BetterAuth → outbox bridge (`apps/api/src/auth/`)

- **`databaseHooks` for core models** (user/session/account/verification), TX-bound, all flows. Used for `USER_CREATED`, `USER_SIGNED_{IN,OUT}`, `USER_ACCOUNT_UNLINKED`.
- **`hooks.after` + `createAuthMiddleware` for plugin events** (twoFactor, passkey, email-verified, password-changed, link-social): path-based. **Guard `if (ctx.context.returned instanceof APIError) return`**, otherwise events fire on 4xx.
- **`hooks.before` + `createAuthMiddleware` for pre-rejection signals** (abuse-prevention: disposable-email, credential-stuffing, HIBP): emits before `throw APIError`. **Trap**: `ctx.context.request`/`ctx.context.session` are `undefined` in before-hooks (runs before session middleware), read IP from `ctx.headers`; load actor via `auth.api.getSession({ headers: ctx.headers })`. Wiring `ctx.context.*` throws before the emit → event silently lost + 500. Only end-to-end tests catch this (unit tests don't mount hooks).
- **Native callbacks**: `emailAndPassword.{sendResetPassword,onPasswordReset}`, `magicLink.sendMagicLink`.

`organizationHooks` covers all org/member/invitation events.

## Hard rules

A nested `uow.run()` joins the open transaction (no savepoint); a failed `Result` or a throw at any depth rolls the whole unit back, even when the outer work caught it; a BetterAuth transaction is a `runOutermost`, its own connection, never joined to an app run; a run's scope is closed when it settles, so a late promise reads the pool; a run with collected events and no flush handler rolls back (`EventsWithoutOutbox`). No store, port or service takes a `tx`: `run(work)` hands `work` nothing and the store (outbox enqueue included) reads `resolveExecutor()`; the open transaction is read through `ambientTransaction()`, never `UnitOfWorkContext`. `addEvent` outside `uow.run()` = events lost (dev-mode warning via `EventCollector.setOutOfContextLogger`).

Relay, lease and handler contract (idempotent on the event id, failure surfaced and never captured, release on shutdown, dead after the max attempts and announced once): `packages/outbox/CLAUDE.md`. Specific to wiring a handler: `handlerName` is a persisted key (kebab-case, unique per type), renaming one reruns it on every pending event; an external call is made idempotent with `handlerIdempotency(name, event)`. Proof against Postgres: `check:outbox-lease`.

## Retention

`outbox_event`, `audit_log`, `webhook_delivery` purged by HMAC-gated `/internal/sweep-*` routes, driven by env knobs `OUTBOX_RETENTION_DAYS` / `AUDIT_LOG_{OPERATIONAL,COMPLIANCE}_RETENTION_DAYS` / `WEBHOOK_DELIVERY_RETENTION_DAYS`. Cron order (FK `ON DELETE RESTRICT`): webhook → audit → outbox. The outbox sweep purges only delivered rows (`dispatched_at < cutoff`): a dead row that never delivered is kept until a replay succeeds. The sweep emits no event (root rule §6 exception).

See [`docs/EVENTS.md`](../../docs/EVENTS.md) for full spec, retention matrix, and cron recipe.
