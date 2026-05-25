# Shared kernel rules (api)

Loaded when working inside `apps/api/src/shared/`. Cross-cutting infra placement decisor. Module-internal rules in `../modules/CLAUDE.md`. Higher-level concerns in `apps/api/CLAUDE.md`.

## What lives here

- `middleware/` — cross-cutting Hono middlewares: `auth`, `error`, `logger`, `org`. Internal-route gating lives in its own folder (see below).
- `internal-routes/` — everything that gates `/internal/*` (cron callers, GH Actions, sidecar schedulers). Grouped by concern, not by technical type:
  - `internal-signature.ts` — HMAC primitives (canonicalize/sign/verify)
  - `internal-signature.middleware.ts` — server-side verifier (`requireInternalSignature`)
  - `private-network.middleware.ts` — RFC1918/loopback gate (`requirePrivateNetwork`)
  - `internal-layers.ts` — env-driven composer (`INTERNAL_AUTH_LAYERS`) — modules use `internalLayers` as one spread
  - `internal-fetch.ts` — client-side `signedInternalFetch`, importable by external schedulers calling `/internal/*`
  - `sweep-<table>.route.ts` — cross-cutting retention sweeps (no single module owner). Module-scoped cron endpoints stay in `modules/<x>/internal.routes.ts` (e.g. `rgpd/`); cross-cutting infra purges (`outbox_event`, `audit_log`, `webhook_delivery`) live here.
- `ports/` — cross-context port interfaces (consumed by 2+ contexts, OR pure transport). Currently: `email.port`, `storage.port`, `outbox.port`, `audit.port`.
- `services/` — cross-context port impls. Currently: `ResendEmailService`, `DrizzleOutboxRepository`, `DrizzleAuditRepository`, `OutboxDispatcher` (LISTEN/NOTIFY worker), `AuditEventSubscriber` + `WebhookFanoutSubscriber` (built-in outbox subscribers).
- `env.ts`, `logger.ts` — process-level singletons
- `transaction.ts` — `type ITransaction = Transaction` (Drizzle alias). Type-only swap-point exception to "no infra in app layer" rule.
- `event-emitter.ts` — `emitEvent(outbox, ...)` helper for code that emits events outside an aggregate flow (BetterAuth bridge, RGPD service, uploads). Use this instead of `outbox.enqueue` directly to keep the source/scope shape consistent.
- `aead.ts` — XChaCha20-Poly1305 encrypt/decrypt + HKDF per-org sub-key for webhook secrets at rest.
- `jitter.ts` — decorrelated jitter math (used by outbox dispatcher + webhook delivery worker for retry backoff).
- `audit-recorder.ts` — `recordAudit(deps, entry, tx?)` helper for service-level transitions without aggregate (e.g. RGPD). For aggregate-driven contexts the `AuditEventSubscriber` writes from the outbox — no direct call needed.

## Port placement decisor — `shared/ports/` vs `modules/<x>/application/ports/`

Decisor = *who consumes the port*, not where the impl lives.

- **`shared/ports/`** = consumed by 2+ contexts, OR pure transport with no business orchestration above. Impl in `shared/services/` if no module owns it (config-as-code: provider URL + template IDs, no rules), or in `modules/<owner>/infrastructure/services/` if a module's *use cases* legitimately own it (impl shares env knobs with the orchestrator — splitting splits config surface).
- **`modules/<x>/application/ports/`** = single-context. Impl in `modules/<x>/infrastructure/repositories/`.
- **Promotion**: 2nd module needs an existing module-private port → move it to `shared/ports/`, fix imports. Don't pre-emptively put everything in `shared/`.
- **Asymmetry between port and impl location is OK.** Goal = absence of cross-module coupling, not symmetry.
- `IUnitOfWork<TTx>` is the lone cross-cutting kernel primitive in `@packages/ddd-kit`; concrete impl `TransactionService implements IUnitOfWork<Transaction>` in `@packages/drizzle`. Project pins `TTx = ITransaction`.

## Anti-patterns

- Creating `modules/<x>/` when a context has only an infra adapter (no domain, no use-cases, no aggregate, no DTO, no routes) — that's *shared kernel infra*, not a bounded context. Live in `shared/ports/`+`shared/services/`. Test: removing the "module" leaves only `module.ts`+a single port impl → not a module.
- Importing a port from another module's `application/ports/` — exactly the cross-module coupling `shared/ports/` exists to prevent. Promote first.
- Letting a `shared/ports/` port become orphan after removing its only remaining consumer → demote back to a module's `application/ports/` or delete. Shared kernel always has ≥ 2 consumers OR is cross-cutting infra.
- `mock.module("@packages/drizzle", ...)` in a test file that exposes only a partial subset of exports — bun runs `*.test.ts` files in parallel and `mock.module` leaks across the process, so the partial mock will surface as `SyntaxError: Export named 'X' not found` in *another* test that imports `X` legitimately. **Always expose the superset** of `@packages/drizzle` exports used by the entire test suite (`db`, `outboxSchema`, `auditLogSchema`, `webhooksSchema`, `inArray`, `eq`, `lt`, `isNotNull`, `and`, `sql`, …) even if your current test only uses two of them.
