# Shared kernel rules (api)

Loaded when working inside `apps/api/src/shared/`. Cross-cutting infra placement decisor. Module-internal rules in `../modules/CLAUDE.md`. Higher-level concerns in `apps/api/CLAUDE.md`.

## What lives here

- `middleware/` — cross-cutting Hono middlewares: `auth`, `error`, `logger`, `org`, `policy`, `rate-limit.middleware` (factory + `requireRateLimit`), `rate-limit.ip` (trusted-proxy IP resolver), `rate-limit.policies` (policy definitions), `csrf.middleware` (`requireCsrf`, Origin-allowlist). Internal-route gating lives in its own folder (see below).
- `internal-routes/` — everything that gates `/internal/*` (cron callers, GH Actions, sidecar schedulers). Grouped by concern, not by technical type:
  - `internal-signature.ts` — HMAC primitives (canonicalize/sign/verify)
  - `internal-signature.middleware.ts` — server-side verifier (`requireInternalSignature`)
  - `private-network.middleware.ts` — RFC1918/loopback gate (`requirePrivateNetwork`)
  - `internal-layers.ts` — env-driven composer (`INTERNAL_AUTH_LAYERS`) — modules use `internalLayers` as one spread
  - `internal-fetch.ts` — client-side `signedInternalFetch`, importable by external schedulers calling `/internal/*`
  - `sweep-<table>.route.ts` — cross-cutting retention sweeps (no single module owner). Module-scoped cron endpoints stay in `modules/<x>/internal.routes.ts` (e.g. `rgpd/`); cross-cutting infra purges (`outbox_event`, `audit_log`, `webhook_delivery`) live here.
  - `csp-report.route.ts` — public `POST /csp-report` endpoint; mounted before globals in `index.ts` (own cors + rate-limit) to preserve cross-origin CORP. Emits `security.csp.violation` event.
- `ports/` — cross-context port interfaces (consumed by 2+ contexts, OR pure transport). Currently: `email.port`, `storage.port`, `outbox.port`, `audit.port`, `instrumentation.port` (`IInstrumentation` — startSpan + capture + addBreadcrumb, Phase 0.4), `rate-limiter.port` (`IRateLimiter`), `health.port`, `password-breach.port`.
- `services/` — cross-context port impls. Currently: `ResendEmailService`, `DrizzleOutboxRepository`, `DrizzleAuditRepository`, `OutboxDispatcher` (LISTEN/NOTIFY worker), `AuditEventSubscriber` + `WebhookFanoutSubscriber` (built-in outbox subscribers), `NoOpInstrumentation` + `SentryInstrumentation` (+ `sentry-init.ts` side-effect for SDK init), `RateLimiterFlexibleAdapter` (impl of `IRateLimiter` — memory / Postgres (dedicated pool) stores; Redis not yet implemented), `HibpPasswordBreachService`.
- `env.ts`, `logger.ts` — process-level singletons
- `transaction.ts` — `type ITransaction = Transaction` (Drizzle alias). Type-only swap-point exception to "no infra in app layer" rule.
- `event-emitter.ts` — `emitEvent(outbox, ...)` helper for code that emits events outside an aggregate flow (BetterAuth bridge, RGPD service, uploads). Use this instead of `outbox.enqueue` directly to keep the source/scope shape consistent.
- `aead.ts` — XChaCha20-Poly1305 encrypt/decrypt + HKDF per-org sub-key for webhook secrets at rest.
- `jitter.ts` — decorrelated jitter math (used by outbox dispatcher + webhook delivery worker for retry backoff).
- `db/quota-reservation.ts` — `reserveQuota` (advisory-lock + count + `assertQuota` inside the caller's TX = authoritative quota gate, TOCTOU-safe) + `countScopedRows` (live `COUNT(*)` default counting strategy). Phase B.2, dormant until a resource is wired. See `docs/QUOTA-GATING.md`.

## Port placement decisor — `shared/ports/` vs `modules/<x>/application/ports/`

Decisor = *who consumes the port*, not where the impl lives.

- **`shared/ports/`** = consumed by 2+ contexts, OR pure transport with no business orchestration above. Impl in `shared/services/` if no module owns it (config-as-code: provider URL + template IDs, no rules), or in `modules/<owner>/infrastructure/services/` if a module's *use cases* legitimately own it (impl shares env knobs with the orchestrator — splitting splits config surface).
- **`modules/<x>/application/ports/`** = single-context. Impl in `modules/<x>/infrastructure/repositories/`.
- **Promotion**: 2nd module needs an existing module-private port → move it to `shared/ports/`, fix imports. Don't pre-emptively put everything in `shared/`.
- **Asymmetry between port and impl location is OK.** Goal = absence of cross-module coupling, not symmetry.
- `IUnitOfWork<TTx>` is the lone cross-cutting kernel primitive in `@packages/ddd-kit`; concrete impl `TransactionService implements IUnitOfWork<Transaction>` in `@packages/drizzle`. Project pins `TTx = ITransaction`.

## Anti-patterns

- Letting `null` past the store. A port signature never says `T | null` for absence — the store converts with `Option.fromNullable` on read and unwraps on write, and routes unwrap back to `null` only when serialising JSON. **Why**: `T | null` leaves the guard to the caller's memory, `Option` makes it structural; the same defect shipped twice (email queue, then webhooks) before the API was back-filled. Exceptions that are not violations: an input DTO whose caller legitimately holds a raw nullable, and a SQL filter where `undefined`/`null`/value mean don't-filter / `IS NULL` / equality.
- Creating `modules/<x>/` when a context has only an infra adapter (no domain, no use-cases, no aggregate, no DTO, no routes) — that's *shared kernel infra*, not a bounded context. Live in `shared/ports/`+`shared/services/`. Test: removing the "module" leaves only `module.ts`+a single port impl → not a module.
- Importing a port from another module's `application/ports/` — exactly the cross-module coupling `shared/ports/` exists to prevent. Promote first.
- Letting a `shared/ports/` port become orphan after removing its only remaining consumer → demote back to a module's `application/ports/` or delete. Shared kernel always has ≥ 2 consumers OR is cross-cutting infra.
- **Claiming logic is covered when it lives in SQL and the test mocks the transaction.** A mocked `tx` never evaluates a `WHERE`, a `CASE`, or a `JOIN` — a green suite around such a method proves only that a method was called. Either keep the decision in TypeScript so a unit test can reach it, or write an executable check against a real database and wire it to a script (`apps/api/scripts/check-fanout-preferences.ts` → `pnpm --filter api check:fanout` is the reference shape), then say so in the commit and in the doc. **Why**: the alternative is a rule that everyone believes is enforced and that nothing enforces — exactly how the notification preference cascade shipped inert. Corollary: **never assert on the SQL text** a builder produced. Those assertions read as coverage but depend on the real `sql` implementation, which another test file's `mock.module` replaces process-wide — they pass or fail on execution order.
- `mock.module("@packages/drizzle", ...)` in a test file that exposes only a partial subset of exports — bun runs `*.test.ts` files in parallel and `mock.module` leaks across the process, so the partial mock will surface as `SyntaxError: Export named 'X' not found` in *another* test that imports `X` legitimately. **Always expose the superset** of `@packages/drizzle` exports used by the entire test suite (`db`, `outboxSchema`, `auditLogSchema`, `webhooksSchema`, `inArray`, `eq`, `lt`, `isNotNull`, `and`, `sql`, …) even if your current test only uses two of them.
