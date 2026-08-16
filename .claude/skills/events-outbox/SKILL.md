---
name: events-outbox
description: Use when working on domain events, the transactional outbox, the BetterAuth event bridge, event retention or sweeps. Trigger on "outbox", "domain event", "emitEvent", "addEvent", "uow.run", "OutboxDispatcher", "databaseHooks", "organizationHooks", "retention", "sweep". Not for audit-log querying or webhook consumer work.
---

# Events (transactional outbox)

`IUnitOfWork.run(cb)` opens an `EventCollector`. `repo.save(agg, tx)` calls `trackEventsOnSuccess` → events flushed via `outbox.enqueue` in the same TX (atomicity). Post-commit, `pg_notify` wakes `OutboxDispatcher` → built-in subscribers (audit, webhook, notification fan-out) in the dispatch TX, then `onEvent(...)` handlers post-commit (best-effort, isolated).

## BetterAuth → outbox bridge (`auth.ts`)

- **`databaseHooks` for core models** (user/session/account/verification) — TX-bound, all flows. Used for `USER_CREATED`, `USER_SIGNED_{IN,OUT}`, `USER_ACCOUNT_UNLINKED`.
- **`hooks.after` + `createAuthMiddleware` for plugin events** (twoFactor, passkey, email-verified, password-changed, link-social) — path-based. **Guard `if (ctx.context.returned instanceof APIError) return`** — otherwise events fire on 4xx.
- **`hooks.before` + `createAuthMiddleware` for pre-rejection signals** (abuse-prevention: disposable-email, credential-stuffing, HIBP) — emits before `throw APIError`. **Trap**: `ctx.context.request`/`ctx.context.session` are `undefined` in before-hooks (runs before session middleware) — read IP from `ctx.headers`; load actor via `auth.api.getSession({ headers: ctx.headers })`. Wiring `ctx.context.*` throws before the emit → event silently lost + 500. Only end-to-end tests catch this (unit tests don't mount hooks).
- **Native callbacks**: `emailAndPassword.{sendResetPassword,onPasswordReset}`, `magicLink.sendMagicLink`.

`organizationHooks` covers all org/member/invitation events.

## Hard rules

`uow.run()` cannot be nested (Drizzle nested TX = independent, not savepoints — guarded by `EventCollector.hasContext()` throw). `addEvent` outside `uow.run()` = events lost (dev-mode warning via `EventCollector.setOutOfContextLogger`).

## Retention

`outbox_event`, `audit_log`, `webhook_delivery` purged by HMAC-gated `/internal/sweep-*` routes, driven by env knobs `OUTBOX_RETENTION_DAYS` / `AUDIT_LOG_{OPERATIONAL,COMPLIANCE}_RETENTION_DAYS` / `WEBHOOK_DELIVERY_RETENTION_DAYS`. Cron order (FK `ON DELETE RESTRICT`): webhook → audit → outbox. The sweep emits no event (root rule §6 exception).

See [`docs/EVENTS.md`](../../docs/EVENTS.md) for full spec, retention matrix, and cron recipe.
