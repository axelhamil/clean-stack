# API rules

Hono on Bun, Clean Architecture + DDD, vertical-slice modules, inwire DI, BetterAuth, Drizzle, storage, org scoping. Auto-loaded under `apps/api/`. Cross-cutting rules: `/CLAUDE.md`. Package contracts it builds on: `packages/ddd-kit`, `packages/drizzle`, `packages/access-control`, `packages/events` (each has its own `CLAUDE.md`).

**Subsystem detail lives in skills: invoke the one you need instead of guessing:**

| Skill | Covers |
|---|---|
| `auth-server` | BetterAuth singleton, request pipeline, rate-limit, CSRF, cookies, login hooks |
| `events-outbox` | transactional outbox, BetterAuth event bridge, retention sweeps |
| `storage-uploads` | presign → PUT → confirm, S3/R2-compatible port |
| `billing-entitlements` | tiers, seats, feature flags, quota gating |
| `compliance-consent` | policy versioning, cookie consent |
| `email-delivery` | email queue, delivery worker, Resend batching |
| `feature-slice` | implementing a story end to end once acceptance criteria exist |

## Layout (vertical slice / modular monolith)

```
apps/api/src/
  shared/                       Cross-cutting infra (no business), see "Shared kernel" below
  modules/<context>/            One bounded context, see "Module anatomy" below
  public-api/                   External API surface (`/api/v1/*`), token-authenticated, no session middleware. See the AppType exception below.
    v1/                         Route files exposed to PAT consumers (opt-in only, each route file is explicit)
    index.ts                    `createPublicApiV1(deps)` factory, mounts `requireApiToken` + dual rate-limit
    require-scope.ts            `requireScope(scope)` guard used inside `/api/v1/*` route files
  cron/                         Standalone cron entrypoints (`sweep.ts`, `rgpd-sweep.ts`, `flush-notification-emails.ts`) over one runner (`internal-job.ts`), each its own process, see `docs/CRON.md`
  container.ts                  Composition root: `.add()` cross-cutting + `.addModule()` per context + `.build()`
  composition/                  Host side of the module contract, see "DI" below
    settings.ts                 `apiSettings(env)`: env mapped once onto each module's typed settings and onto `authSettings`
    sources/<consumer>.ts       Binds a port a module declares to what the host or another module provides; `sources/auth.ts` binds the ports `auth/` declares and assembles the `authDeps` key
    route-guards.ts             `routeGuards`: the `RouteGuards` of `@packages/http` built from `shared/middleware`
  auth/                         BetterAuth singleton, deliberate exception to the modules rule (config-as-code, the lib owns the model). Routes auto-mount via the plugin (`/api/auth/*`). Every file below `index.ts` reads its collaborators and settings from `AuthDeps`, never from the container or the env, so a guard test builds a real instance with `createAuth(fakeAuthDeps(...))` instead of mocking the container.
    index.ts                    The only file in `auth/` importing the container: `export const auth = createAuth(di.authDeps)`, `SessionUser` / `SessionData`
    create-auth.ts              `createAuth(deps)`: the options and the `plugins` array in its load-bearing order
    deps.ts                     `AuthDeps` (every collaborator and setting `auth/` reads) and `AuthSettings`
    ports.ts                    The ports `auth/` declares for the services it consumes that no shared port covers
    helpers.ts                  `createAuthHelpers(deps)`: the helpers below, built once per instance and handed to plugins and hooks
    plugins/<name>.ts           One factory over `(deps, helpers)` per plugin with hooks or helpers of its own (`stripe`, `organization`, `sso`, `scim`, `clear-expired-ban`, `security-signals`)
    hooks/{before,after,database}.ts   Factories over `(deps, helpers)` for the top-level `hooks.before` / `hooks.after` / `databaseHooks`
    emit.ts, email.ts, visitor.ts, snapshots.ts, personal-org.ts, entitlements.ts, seats.ts, scim-events.ts   Helpers shared by the files above; a plugin file never imports another plugin file and a hook never imports a plugin file
    queries.ts                  Typed Drizzle data access for the bridge, plain functions (no port, DI or aggregate: auth is not domain), reading `resolveExecutor()`. Keeps `auth/` config + event wiring only, never inline `db.*`.
  app.ts                        `Hono` construction, chained `.route()` mounts, middleware, `export const routes` / `export type AppType`. No server boot.
  index.ts                      Server entry: explicit `Bun.serve()` handle (kept on `globalThis` so `bun --hot` reloads it instead of rebinding the port), DI preload, worker starts, ordered shutdown steps. Imports `app` from `app.ts`, re-exports `AppType`.
  migrate.ts                    Migration entry (`pnpm --filter api migrate`); `start` runs it before the server
  client.ts                     `hcWithType` factory, `hc<AppType>` (`AppType` from `app.ts`)
```

**Module boundary.** Within a module, layers import inwards (`infrastructure/` → `application/` → `domain/`). Cross-module: domain events, `shared/ports/`, or `shared/services/` only. **Modules NEVER import each other**, not even ports. Enforced by `pnpm check:boundaries` (dependency-cruiser, `.dependency-cruiser.cjs`): no cross-module import, `domain/` and `application/` free of infrastructure, database and frameworks, `domain/` reaching only `ddd-kit`, `events`, `zod` and its own module, packages never import an app, the front reaches the api only through `api/client`. `module.ts` is imported only by `container.ts`; routes only by `app.ts`. Re-exporting routes from `module.ts` recreates the cycle `module → routes → container → module` (Biome flags it).

**Removability.** `trash modules/<context>/`, remove its `.addModule()` and `app.route()` lines and its `export *` in the schema barrel; TS error-points the rest. Shared kernel always has ≥ 2 consumers OR is cross-cutting infra by nature.

## Module anatomy

```
modules/<context>/
  domain/                       ONLY when the context has DDD primitives extending ddd-kit. No `domain/` for anemic data, those live with the port. An empty `domain/` is cargo-cult.
  application/
    ports/                      Module-private interfaces + failure shape + data records
    use-cases/                  One file per use case (orchestrates ≥ 1 aggregate with infra)
    services/                   Pure-infra orchestration, `<Noun>Service` with N methods. May call `this.<other>`, never inject a service into another.
    dto/                        Zod (`<verb-noun>.dto.ts`, `<Noun>Input = z.infer<...>`)
    event-handlers/             Side effects on domain events
  infrastructure/
    repositories/               Drizzle impls of module-private ports: `*.store.ts` (`I<Noun>Store`) for persistence without an aggregate (projections, settings, read models), `*.repository.ts` only where the port models an owned record with a lifecycle
    mappers/                    Domain ↔ DB
    services/                   Port impls when the port is module-owned
  routes.ts                     `create<Name>Routes(deps)`: guards and services from `deps`, never `di` nor a middleware import. Extra surfaces sit next to it as `<name>.routes.ts`
  <context>.schema.ts           Drizzle table(s) the module owns, when not in `@packages/drizzle`
  internal.routes.ts            `create<Name>InternalRoutes(deps)`: cron/job sub-app gated by the `internalGuards` it receives (header comment states the gate)
  module.ts                     inwire `defineModule<<Name>Prerequisites>()`, registers via `.add()`. NEVER re-exports routes (cycle).
  __TESTS__/                    All tests at module root, never colocated. Mirrors source filenames.
```

**The tree is the target shape for a business module; no module has a `domain/`, `use-cases/` or `mappers/` folder today.** Every shipped module is infra-only (config + `<Noun>Service`/store + routes): orchestration defaults to `application/services/`, and row mapping stays inside the store. Add `domain/` and `use-cases/` only when the decisor below says an aggregate exists. Billing gates (`requireFeature`/`requirePlan`, `requireQuota`/`reserveQuota`, seat checks) live in `shared/middleware/billing.middleware.ts`, `shared/auth/organization-seats.ts`, `shared/db/quota-reservation.ts` and org-plugin hooks, not use cases: billing, auth, plans and quotas are config + middleware + hook, never DDD. `@modules/quotas` (`modules/quotas/` at the repo root) is a store-only infra module (`IQuotaUsageStore` + `quota_usage` table), no service, no routes.

**Do I need an aggregate?** The rule fits in `array.includes()`, `count(*)` or a config lookup → infra orchestration, stay flat. An entity has an invariant only it can enforce (`<Aggregate>.canCancel()` checks several props) → aggregate. SQL counts are not invariants. Primitive semantics (`Result`, `Option`, `ValueObject`, ...): `packages/ddd-kit/CLAUDE.md`.

## Layer purity

**Domain has zero external imports** (only `@packages/ddd-kit` + `zod`). **Application has zero infrastructure imports**: `application/**` imports only `@packages/ddd-kit`, `zod` and the ports and types it owns. NEVER `@packages/drizzle`, `better-auth`, `@aws-sdk/*`, `resend`, or any provider concrete type (`PgTransaction`, `SessionUser`, `S3Client`, ...). **Why**: application says *what*, not *how*; a use case importing a provider type survives a swap only by accident, which is exactly what ports exist to prevent. Cross-aggregate references use the typed id of the referenced module (`<name>-id.ts`, see `packages/ddd-kit/CLAUDE.md`), never `SessionUser["id"]` or `string`.

## Shared kernel (`shared/`)

Cross-cutting infra, no business. Inventory by concern (the file-level list is `docs/FEATURES.md`); the rule is where a new file goes.

- `middleware/`: Hono middlewares (auth, error, logger, org, policy, billing gates, api-token, staff guards, deny-impersonated, rate-limit factory + policies + trusted-proxy IP, CSRF Origin allowlist).
- `internal-routes/`: everything that gates `/internal/*` (cron callers, GH Actions, sidecar schedulers), grouped by concern: `internal-signature` (HMAC primitives + server verifier), `private-network.middleware` (loopback/RFC1918), `internal-layers` (env-driven composer, the host hands it to module internal routes as `internalGuards`), `internal-fetch` (client-side `signedInternalFetch`, importable by external schedulers). Also the cross-cutting retention sweeps `sweep-<table>.route.ts` (no single module owner; they share `sweep-lock` and `sweep-route` here and the sweep kit: `sweep-runner`, `sweep-heartbeat` in `@packages/http`, `sweep-purge`, `sweep-count`, `sweep-span` in `@packages/drizzle`), `flush-notification-emails.route.ts`, and the public `csp-report.route.ts` (mounted in `app.ts` before the global middlewares with its own cors + rate-limit, to preserve cross-origin CORP). A module-scoped cron endpoint stays in `modules/<x>/internal.routes.ts`.
- `ports/` + `services/`: cross-context ports and the impls no module owns (see the decisor below). Built-in outbox subscribers live in the module that reacts (`audit-log`, `webhooks`, `notifications`), which registers them; the host hands them to `buildEventDispatcher`; the relay, the dispatcher and their registration live in `packages/outbox`.
- `auth/`: helpers for the BetterAuth bridge (SAML config, SSO enforcement and paths, request snapshots, SCIM membership, `totp-options.ts`: the TOTP digits and period `twoFactor` and `ITotpVerifier` both verify with).
- `surface/`: back↔front route parity: `back-routes.ts` (live route table from `app.ts`), `front-consumers.ts` (front `api.*.$method` call-site scan), `route-map.ts` (documented per-route intent); `__TESTS__/surface-parity.test.ts` fails on drift. See `docs/SURFACE.md`.
- `db/quota-reservation.ts`: `reserveQuota` (advisory lock + count + `assertQuota` inside the caller's TX = authoritative, TOCTOU-safe quota gate) and `countScopedRows`. Dormant until a resource is wired. See `docs/QUOTA-GATING.md`.
- Kit packages the shared kernel builds on, each with its own rules: `packages/http` (request validator, time-id cursor pagination, route-guard contract), `packages/outbox` (outbox port, `emitEvent` / `emitEventBestEffort`, relay, dispatcher, event actor, lease mechanics), `packages/email` (email port, Drizzle queue, `EmailDeliveryWorker`; driven by the `email-delivery` skill).
- `request-context.ts` (request-scoped ALS: request id + trusted-proxy client IP, for BetterAuth hooks that have no Hono context), `shutdown.ts` (`lifecycleState`, `runShutdown` / `installShutdown`: steps in series, each raced against its timeout, a global deadline, exit `0` only when every step finished).
- `env.ts`, `logger.ts`: process-level singletons. `env-bounds.ts` (`validateEnvBounds`) holds the cross-field refinement that fails the boot when the sweep timeouts are not nested; kept out of `env.ts` so a test can call it without a full `.env`. `env-schema.ts` holds the schema and the keys production requires, free of side effects so `infra/coolify` can check the declared api env against it.

### Port placement: `shared/ports/` vs `modules/<x>/application/ports/`

The decisor is *who consumes the port*, not where the impl lives.

- **`shared/ports/`** = consumed by 2+ contexts, OR pure transport with no business orchestration above it (email, storage, SMS-like senders: shared from the first consumer). Impl in `shared/services/` when no module owns it (config-as-code: provider URL + template ids, no rules), or in `modules/<owner>/infrastructure/services/` when a module's *use cases* legitimately own it (the impl shares env knobs with the orchestrator, splitting would split the config surface).
- **`modules/<x>/application/ports/`** = single context with business orchestration above it. Impl in `modules/<x>/infrastructure/repositories/` for a persistence port, `modules/<x>/infrastructure/services/` for a port to an external service.
- **Promotion**: a 2nd module needs an existing module-private port → move it to `shared/ports/`, fix imports. Don't pre-emptively put everything in `shared/`. Demote when the 2nd consumer disappears; delete when the 0th does.
- Asymmetry between port and impl location is fine. The goal is the absence of cross-module coupling, not symmetry.
- `IUnitOfWork` is the lone cross-cutting primitive in `@packages/ddd-kit`; `run(work)` hands `work` nothing, the open transaction lives in the ambient scope (impl: `packages/drizzle/CLAUDE.md`).
- **Not a module**: a context with only an infra adapter (no domain, use cases, aggregate, DTO or routes) is shared-kernel infra. Test: removing the "module" leaves only `module.ts` + one port impl → it is not a module.

## CQRS

- **Commands** (writes): Controller → Use Case or Service → Aggregate or Store → EventDispatcher → Handlers
- **Queries** (reads): Controller → Query (direct ORM, no use case)

## DI (inwire)

A module states what it needs in `<Name>Prerequisites` and what it adds through `.add()`; `container.ts` chains `.addModule(...)`, and inwire refuses at compile time a module whose prerequisites are not on the builder yet or whose keys are already there.

```ts
// modules/<x>/module.ts
export interface FooPrerequisites { IInstrumentation: IInstrumentation; IBarLookup: IBarLookup; fooSettings: FooSettings; }
export const fooModule = defineModule<FooPrerequisites>()((b) =>
  b.add("IFooStore", (c): IFooStore => new DrizzleFooStore(c.IInstrumentation))
   .add("FooService", (c) => new FooService(c.IFooStore, c.IBarLookup, c.fooSettings)),
);
```

1. **`defineModule<<Name>Prerequisites>()` with its explicit generic, never the global `AppDeps` augmentation.** **Why**: a module typed against `AppDeps` sees every key of every other module, so its real dependencies are invisible and it cannot be type-checked outside the app that augments it, which a module living in its own package must be. Modules still on `AppDeps` are migrating; while one of them reads a key a migrated module provides, it declares that key in its own augmentation, never the provider.
2. **Every host binding a module receives lives in `composition/`**: env mapped to typed settings in `settings.ts`, a consumer's port bound in `sources/<consumer>.ts` (`.add("IBarLookup", (c) => c.BarDirectory)`), `auth/` included (its `AuthDeps` is the `authDeps` key of `sources/auth.ts`), and `app.ts` hands each route factory `di.scope({ routeGuards, ... })`, which also carries the host pieces a route needs beyond the container (`internalGuards`, the sweep runner, a route-specific rate limit, `IAuthProvider` bound to the auth instance). The module side of that contract is `modules/CLAUDE.md`. **Why**: the wiring of every context reads in one folder, so removing a module or a provider fails `tsc` at exactly the lines that named it.
3. **`scope`, never `extend`, to hand the container more keys.** `extend` copies the resolved cache, so a binding resolved after it exists twice (a stateful hub would split); `scope` delegates to the parent. `routeGuards` is not in `container.ts` because the middlewares it wraps import `di` (cycle).
4. **Use `typeof di`** for the runtime shape after `.build()`, not the global `AppDeps` interface.
5. **All deps via DI**; never `new` a collaborator outside the container (it bypasses the container and breaks per-test impl swaps). No service locators: a route reads `deps`, a test passes a plain `deps` object (`openRouteGuards()` from `@packages/http/testing/route-guards`).
6. **Transactions are opened by `uow.run` in use cases and route handlers; repositories read the ambient executor.** A route opens `ITransactionService.run(...)` from its `deps` only when it composes several store writes itself (`profile`, `notifications` routes). No port, store or service declares a transaction parameter, and only `packages/drizzle` and scripts open a transaction directly; `src/__TESTS__/layering.test.ts` enforces both, each allowance carrying its reason. **Why**: a handle threaded by hand is forgotten at one call site, and that write silently commits outside the unit it belongs to.

## Domain events (zero-plumbing rail)

Event declaration, payload and actor contract: `packages/events/CLAUDE.md`. Events are *added* in aggregate methods (`this.addEvent(...)`), then **automatically** flushed into the outbox by `IUnitOfWork.run()`. The use case writes ZERO event-dispatch code:

```typescript
async execute(input: PlaceOrderInput): Promise<Result<Order, OrderError>> {
  return this.uow.run(async () => {
    const order = Order.place(input);          // addEvent(OrderPlaced) inside
    return this.repo.save(order);               // ambient tx, pulled into ALS collector
  });
  // → outbox_event INSERT happens HERE, in the same TX, before COMMIT
  // → audit_log + webhook_delivery rows written by built-in subscribers
}
```

**Hard rules**:
- A `uow.run()` started inside an open one joins its transaction: same connection, no savepoint, its collected events wait for the outermost run's flush. A failed `Result` returned at any depth (even swallowed by the outer work) rolls the whole unit back and the outermost `run()` resolves to that first failure; a throw at any depth rolls back and propagates, even when the outer work caught it. The ambient scope is marked closed when its run settles, so a promise that outlives its run reads the pool (`resolveExecutor()` returns `db`), never a transaction whose client went back to the pool. **Why**: node-postgres does not refuse a query on a released client, it may run on a connection another request now holds. Proven against Postgres by `check:uow-rollback`.
- A run that collected events but has no flush handler rolls back with `EventsWithoutOutbox` instead of committing without them. The container wires the outbox enqueue, so this only catches a hand-built `TransactionService` that forgot it.
- A callback that resolves to a failed `Result` rolls the whole transaction back (writes and collected events) and `run()` resolves to that `Result`. Return the failure, never throw a sentinel to force the rollback. **Why**: a failure is all or nothing without the caller remembering to throw, and a thrown sentinel has to be told apart from a real crash in every `catch`. Proven against Postgres by `check:uow-rollback`.
- Repos must call `EventCollector.collectFrom(aggregate)` (`@packages/ddd-kit`) once their `save`/`create` write succeeded, otherwise events stay on the aggregate buffer and are silently lost.
- `addEvent()` outside `uow.run()` = events lost (warning logged in dev via `EventCollector.setOutOfContextLogger`).

**Outside an aggregate** (every shipped module today), a write and its `emitEvent(outbox, ...)` share one `uow.run(async () => ...)`. Stores take no `tx`: they read `resolveExecutor()`, so both land in the run's transaction. `emitEvent` passes no `tx`: the outbox reads `resolveExecutor()` too. In tests, use `mockUnitOfWork` and record `UnitOfWorkContext.transaction()` inside the store and `enqueue` mocks, then assert both saw the same one: a call count passes even when both writes run outside the transaction.

BetterAuth's adapter receives `db` through `asUnitOfWork` (`shared/auth/unit-of-work-adapter.ts`): each transaction it opens is a `runOutermost`, its own connection even inside an app run, so a plugin change commits on its own and the hooks inside it join that transaction. A run that resolves to a failed `Result` makes the adapter's transaction reject, never report success over a rollback. Proven by `check:auth-transaction` and `check:scim-connection`.

An action only the auth library can perform commits on that connection, so it cannot join the run: it goes last in the unit, after the emit, and a refusal returns a failed `Result` that rolls the event back. The exception is a library call whose hooks write and whose errors it swallows (password reset): it goes after the unit, and a request-scoped holder tells whether the hook finished. A second exception is a library call whose result the event must name (an id the library generates, the members its reconciliation removed) or whose return value is the only copy of a credential (SCIM connection tokens): the call goes first inside the serialised unit, its events follow on a savepoint of that unit, and a failed emit is captured, never turned into a failed request, since failing would leave the caller with a revoked credential and no replacement (`ScimConnectionService`). **Why**: the reverse order drops the event on any failure, this one only when the commit itself fails after the library committed; that residual window (an action without its event) is the accepted cost. Everything the library does not own is written directly so it has no window at all, the store then preserves what the library did (fields written, its sign-out events). `AdminModerationService` is the reference.

**Handlers built in** (`buildEventDispatcher` from `packages/outbox` subscribes them to every catalog type, so a type with no handler cannot exist): `audit-log` (`AuditEventSubscriber`, writes `audit_log` if the event is in `RETENTION_MAP`), `webhook-fanout` (`WebhookFanoutSubscriber`, creates `webhook_delivery` rows for matching org-scoped endpoints) and `notification-fanout` (`NotificationFanoutSubscriber`, creates notification rows and schedules email digests, honouring user/org preference precedence). Each runs its own short `uow.run` and writes with a key derived from `eventId` and `ON CONFLICT DO NOTHING`, so a redelivery writes nothing twice.

**User-defined handlers** via `onEvent(type, handlerName, factory, { payload })` + inwire binding, auto-discovered at boot via `EVENT_HANDLER_SYMBOL`. The parser comes from `payloadParser(PayloadByEventType[type])` (`@packages/outbox/payload-parser`), declared as a module constant (built inline, its type is not inferred into the body):

```typescript
const parsePayload = payloadParser(PayloadByEventType[EventTypes.ORDER_PLACED]);

b.add(
  "NotifyCustomerOnOrderPlaced",
  onEvent(
    EventTypes.ORDER_PLACED,
    "notify-customer-on-order-placed",
    (c) => async (event, payload) =>
      c.IEmailService.sendTemplate("order_confirmed", payload.email, ..., handlerIdempotency("notify-customer-on-order-placed", event)),
    { payload: parsePayload },
  ),
)
```

Handlers run **after commit, outside any transaction**, through the outbox relay; the relay, its lease model (shared by `EmailDeliveryWorker` and `WebhookDeliveryWorker`) and the handler contract (idempotent on `eventId`, failure surfaced as a failed `Result`, dead after the max attempts, announced once) are `packages/outbox/CLAUDE.md`. The host maps its env onto the kit: knobs `OUTBOX_LEASE_SECONDS`, `OUTBOX_HANDLER_BUDGET_SECONDS`, `OUTBOX_MAX_ATTEMPTS`, `OUTBOX_DEAD_RETRY_HOURS`, `OUTBOX_CONCURRENCY`, `EMAIL_LEASE_SECONDS`, `EMAIL_DEAD_RETRY_HOURS`, `EMAIL_DEAD_REPLAY_WINDOW_HOURS`, `WEBHOOK_LEASE_SECONDS`, `WEBHOOK_DEAD_RETRY_HOURS` in `.env.example`; each lease must cover its budget + the settle margin the kit exports, enforced at boot by `shared/env-bounds.ts`. Proven by `check:outbox-lease`, `check:email-lease`, `check:webhook-lease` and `check:marksent`.

Full DX guide, retention map and BetterAuth bridge specifics: `docs/EVENTS.md`.

## Hono RPC (end-to-end type safety)

The API exports `AppType`; the app consumes it via `hono/client`. Routes **must be chained**: `app.use`/`app.onError` don't accumulate types. Don't reintroduce `registerXxx(c, app)`, it loses the chained `.route()` and breaks `AppType`.

**Exception: `/api/v1` is deliberately outside `AppType`.** `createPublicApiV1(deps)` is mounted with `app.route("/api/v1", ...)` before the `const routes = app.get(...).route(...)` chain, so it is not part of `AppType`. **Why**: `/api/v1` serves external PAT consumers, not the typed RPC client; chaining it would expose every public route to `hcWithType`, which the internal client does not need, and would impose `AppType`'s session-based `Variables` shape on routes that carry `ApiTokenVariables`. A new route file under `public-api/` that is not in `AppType` is correct.

`package.json` subpath exports: `.` → `AppType` + runtime; `./app` → the `Hono` app; `./client` → `hcWithType`. Client usage rules live in `apps/app/CLAUDE.md`.

## Logging & error handling

**No `console.*` in production**: all logs go through `pino` (JSON stdout in prod, `pino-pretty` in dev). HTTP: `hono-pino` with `referRequestIdKey: "requestId"`; status-driven level (`5xx` → error, `4xx` → warn, else info).

**One `app.onError(...)`, no per-route `try/catch`**: `createErrorHandler(instrumentation)` is called once in `app.ts`, `di` already built; it binds the envelope of `@packages/http/error-handler` to the api logger and environment, and a module's route test builds that envelope directly. **Why a factory**: it takes the dependency as a parameter, so it stays immune to the runtime cycle that appears if a module ever imports `shared/middleware/`. Envelope: `HTTPException` → `{ error: { code, message, requestId } }` (logged at `error` only for ≥ 500). Unknown → `500 INTERNAL_ERROR` (stack only outside prod).

Domain and application use `Result<T, E>` (no throw); the controller translates to `HTTPException`. Never invent a per-route error envelope. Typed error codes map to HTTP through `httpStatusFromCode` (`*_NOT_FOUND` → 404, `*_FORBIDDEN` → 403).

## Observability (`IInstrumentation`)

**Single port, DI everywhere.** `IInstrumentation` (`@packages/ddd-kit`, so a package can depend on it too) combines `startSpan`, `capture`, `addBreadcrumb`, `setSpanAttributes` (writes onto the span open around the caller, silently dropped outside one) and `flush(timeoutMs)` (drains pending events, resolves `false` when the timeout cut it short; the shutdown calls it last). Default `NoOpInstrumentation`; `SentryInstrumentation` swaps in when `env.SENTRY_DSN` is set (`container.ts`). **No module-level singleton, no service locator**: every I/O class receives it via constructor. Sentry SDK init exception: `import "./shared/services/sentry-init"` is the first import of `index.ts` (it must hook async-hooks before pino/Hono/Drizzle).

**Instrumentation pattern** (see [`docs/OBSERVABILITY.md`](../../docs/OBSERVABILITY.md)):
- **Outer span** wraps the method body: `{ name: "ClassName > methodName" }`. No `op`, no attributes.
- **Inner span** wraps `query.execute()` / `client.send()` / `fetch()`: `{ name: query.toSQL().sql, op: "db.query", attributes: { "db.system.name": "postgresql" } }` (or `op: "http.client"`).
- **`const exec = resolveExecutor()`** outside the `startSpan` callback (ambient transaction of the open `uow.run`, else `db`); no `tx` parameter.
- **catch + `this.instrumentation.capture(err)`** + return `Result.fail(...)` or rethrow. Never swallow.
- **Multi-query methods** (e.g. `executeWipe`): outer span only.
- **Don't call sibling-repo methods from inside a span**: inline the query.

## Organization scoping (server)

1. **Ownership at the port (`ScopedRepository`), not the route.** `requireOrg` exposes `c.var.orgId`; the controller builds `RepoScope.org(orgId)` and passes it to the use case; `requireOrgPermission` gates capabilities. Skipping `requireOrg` on a handler that reads or writes `organizationId`-scoped rows silently accepts requests with no active org.
2. **Queries (CQRS read side) take the same `RepoScope` and AND-join it in `WHERE`**: `(input, scope: RepoScope) => Promise<...>`.
3. **Every business table owns `organizationId NOT NULL` + FK `organization(id) ON DELETE CASCADE` from its first migration** (schema rule: `packages/drizzle/CLAUDE.md`). Post-hoc multi-tenancy is the most expensive refactor class; never skip it, even for a solo product today.
4. **Personal org is never special-cased except via `isPersonalOrg(slug)`** (`@packages/access-control`; `slug = personal-${orgId}`). No `isPersonal` flag. It cannot be deleted (`beforeDeleteOrganization` rejects) or left: removal goes through account deletion (cascade). **Why**: it is 1:1 with the user, standalone deletion would orphan them.
5. **Personal self-heals at every sign-in; non-Personal auto-collapses when its last member leaves.** `ensurePersonalOrgFor(userId)` runs in `databaseHooks.user.create.after` AND `session.create.before`; `organizationHooks.afterRemoveMember` deletes empty non-Personal orgs. Never duplicate inline.
6. **Server gate**: `requireOrgPermission(permissions)`, the same `OrgPermissions` shape as the front. Authorization model and defense-in-depth layers: `packages/access-control/CLAUDE.md`.

## Testing

BDD style, runner `bun test`. One test file per service, use case, store/repository, DTO or route file under `__TESTS__/` (services group `describe` per method). Mock at repository/port level. Test `Result`/`Option` state transitions. Outbox and unit-of-work doubles are `mockPort<IOutboxRepository>()` and `mockUnitOfWork()` (`@packages/test/bun`), never a hand-written object; `enqueuedEvents(outbox)` (`@packages/outbox/testing/enqueued-events`) reads what a mocked outbox received.

**Substitute through the seam the code already has, before reaching for a module replacement.** A handler that takes its collaborators as arguments, a route factory that takes a `deps` object, a class that takes its repository in the constructor: pass a fake, and the substitution is scoped by construction, typed against the real port, and visible in the test's first ten lines. Replacing the module is the fallback for the cases with no seam (a module-level singleton like `db`, a third-party SDK, a lib imported directly). **Why**: injection cannot reach past the object under test, so it cannot be the reason another test's verdict changed, and the day a collaborator gains a method the compiler names every fake that must grow. Reference shape: `github-key-verifier.test.ts`.

**Stand in for a module by spreading the real one; never hand-copy its surface.** `mock.module("@packages/events", () => ({ ...realEvents, EventTypes, SomePayload: stub }))`, and derive any map from the real catalog (`Object.values(EventTypes).map(...)`) rather than listing its keys. **Why**: a hand-kept copy is correct exactly once; every export added afterwards silently becomes `undefined` in that file, and an assertion on it compares `undefined` to `undefined`, green and meaningless.

**A test file must not be able to change how another test file behaves, and the harness, not discipline, guarantees it.** Replacing a module, patching a global or mutating a shared fixture is legitimate *inside* the file that does it; if the effect can outlive that file, the suite's verdict becomes a function of file order. So: every runner gives each test file its own module registry and globals (`apps/api` passes `--isolate`, `--parallel` implies it; `apps/app` and `packages/*` get it from vitest by default), and `shared/__TESTS__/module-isolation.*.test.ts` is a canary pair that fails the moment that stops being true. Inside a file, reset shared mutable state in `beforeEach`. **Why**: an order-dependent suite goes green on wrong code and red on right code, and once a team has seen either, no result from it is believed again. **Test before merging a test file**: run it alone, then run the suite in another order (`bun test --isolate --randomize --seed=<n>`); a verdict that moves is a harness bug, never a flake to retry.

**Never claim logic is covered when it lives in SQL and the test mocks the transaction.** A mocked `tx` never evaluates a `WHERE`, a `CASE` or a `JOIN`: a green suite around such a method proves only that a method was called. Either keep the decision in TypeScript so a unit test can reach it, or write an executable check against a real database, wired to a `check:*` script AND a step in `.github/workflows/ci.yml` in the same change (`scripts/check-fanout-preferences.ts` → `check:fanout` is the reference shape). **The CI step is not optional bookkeeping**: a check nothing runs proves nothing. **Corollary**: never assert on the SQL text a builder produced in a file that replaces the query builder; reading a string back out of a stand-in asserts on the stand-in, not on the query.

**A port never expresses absence as `T | null`**: `Result<Option<T>, E>` for a lookup that may find nothing, `Option<T>` for a record field that may be unset. `null` exists only inside a store while mapping a driver row (`Option.fromNullable`) and when a route serialises JSON. Not violations: an input DTO whose caller legitimately holds a raw nullable, and a SQL filter where `undefined`/`null`/value mean don't-filter / `IS NULL` / equality. **Why**: `T | null` leaves the guard to the caller's memory, `Option` makes it structural.

## Commands

- **Tests**: `pnpm --filter api test` (`bun test --isolate --parallel`); a bare `bun test` drops file isolation. `bunfig.toml` preloads `src/__TESTS__/preload.ts`, which supplies a test-only `INTERNAL_SIGNING_KEY` when none is exported, so a fresh `pnpm bootstrap` runs green.
- **Real-database checks**: `pnpm --filter api check:{fanout,digest,api-token-visibility,wipe-rollback,uow-rollback,marksent,enqueue,sweep-lock,auth-transaction,scim-seats,scim-connection,outbox-lease,email-lease,webhook-lease,admin-staff,admin-atomicity,admin-step-up,admin-approval,admin-ops,admin-accounts,admin-workspace}` (scripts in `scripts/`, refuse a non-local database via `require-local-database.ts`, all wired in `.github/workflows/ci.yml`). A new SQL-heavy decision the mocks cannot cover gets a script AND a CI step. Re-run the matching one after touching the code it covers.
