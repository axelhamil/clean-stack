# API rules

Hono on Bun, Clean Architecture + DDD, vertical-slice modules, inwire DI, BetterAuth, Drizzle, storage, org scoping. Auto-loaded under `apps/api/`. Root rules in `/CLAUDE.md`; layer rules in `src/modules/CLAUDE.md` and `src/shared/CLAUDE.md`.

**Subsystem detail lives in skills — invoke the one you need instead of guessing:**

| Skill | Covers |
|---|---|
| `auth-server` | BetterAuth singleton, request pipeline, rate-limit, CSRF, cookies, login hooks |
| `events-outbox` | transactional outbox, BetterAuth event bridge, retention sweeps |
| `storage-uploads` | presign → PUT → confirm, S3/R2-compatible port |
| `billing-entitlements` | tiers, seats, feature flags, quota gating |
| `compliance-consent` | policy versioning, cookie consent |
| `email-delivery` | email queue, delivery worker, Resend batching |

## Layout (vertical slice / modular monolith)

```
apps/api/src/
  shared/                       Cross-cutting infra (no business) — see src/shared/CLAUDE.md
    middleware/                 Hono middlewares: auth, error, logger, org, rate-limit (factory + policies + trusted-proxy IP), csrf (Origin-allowlist)
    internal-routes/            `/internal/*` gate: `internal-signature` (HMAC primitives + server verify middleware), `private-network.middleware` (loopback/RFC1918), `internal-layers` (env-driven composer), `internal-fetch` (client-side signed-fetch)
    ports/                      Cross-context port interfaces
    services/                   Cross-context port impls (when no module owns the impl)
    surface/                    Back↔front surface map: `back-routes.ts` (live route table from `app.ts`), `front-consumers.ts` (front-end `api.*.$method` call-site scan), `route-map.ts` (documented per-route intent) — `surface-parity.test.ts` fails on drift. See `docs/SURFACE.md`.
    env.ts, logger.ts           Process-level singletons
    transaction.ts              `type ITransaction = Transaction` — single swap-point exception
  modules/<context>/            See src/modules/CLAUDE.md for layered rules
  public-api/                   External API surface (`/api/v1/*`) — token-authenticated, no session middleware. See AppType exception below.
    v1/                         Route files exposed to PAT consumers (opt-in only — each route file is explicit)
    index.ts                    `createPublicApiV1(deps)` factory — mounts `requireApiToken` + dual rate-limit
    require-scope.ts            `requireScope(scope)` guard used inside `/api/v1/*` route files
  container.ts                  Composition root: `.add()` cross-cutting + `.addModule()` per context + `.build()`
  auth.ts                       BetterAuth singleton — deliberate exception to modules/ rule (config-as-code, lib owns model). Routes auto-mount via plugin (`/api/auth/*`).
  auth-queries.ts               Typed Drizzle data-access for the bridge — plain functions (no port/DI/aggregate; auth is not domain), `tx?`-aware. Keeps `auth.ts` config + event-wiring only, never inline `db.*`.
  app.ts                        `Hono` construction — chained `.route()` mounts, middleware, `export const routes` / `export type AppType`. No server boot.
  index.ts                      Server entry: `Bun.serve()`, DI preload, worker starts, graceful shutdown. Imports `app` from `app.ts`, re-exports `AppType`.
  client.ts                     `hcWithType` factory — `hc<AppType>` (`AppType` from `app.ts`)
```

**Module boundary.** Within a module, layers import inwards (`infrastructure/` → `application/` → `domain/`). Cross-module: domain events, `shared/ports/`, or `shared/services/` only. **Modules NEVER import each other** — not even ports. `module.ts` imported only by `container.ts`; routes only by `app.ts`. Re-exporting routes from `module.ts` recreates the cycle `module → routes → container → module` (Biome flags).

**Removability.** `trash modules/<context>/` + remove `.addModule()`/`app.route()` lines + `export *` in schema barrel. TS error-points the rest. Shared kernel always has ≥ 2 consumers OR is cross-cutting infra.

## CQRS

- **Commands** (writes): Controller → Use Case → Aggregate → Repository → EventDispatcher → Handlers
- **Queries** (reads): Controller → Query (direct ORM, no use case)

## DI (inwire)

Each module declares what it ADDS via `declare module 'inwire'` augmentation; `container.ts` chains `.addModule(...)`. `c.X` resolves regardless of registration order; missing binding → `tsc` rejects.

```ts
// modules/<x>/module.ts
declare module "inwire" {
  interface AppDeps { IFooPort: IFooPort; FooService: FooService; }
}
export const xModule = defineModule()((b) =>
  b.add("IFooPort", (): IFooPort => new ConcreteFooAdapter())
   .add("FooService", (c) => new FooService(c.IFooPort)),
);
```

1. **`declare module 'inwire'` per file that registers** — co-located with `.add()`. `container.ts` declares cross-cutting bindings it adds directly.
2. **Never `defineModule<TDeps>()`** with explicit generic — fallback for forward-refs only.
3. **`Di = typeof di`** after `.build()` — derived runtime shape, not the global `AppDeps` interface.
4. **All deps via DI** — `di.XxxUseCase.execute(...)`; never `new Xxx(...)` (bypasses container, breaks per-test impl swap). No service locators.
5. **Transactions managed in controllers**, passed to use cases/services.

## Hono RPC (end-to-end type safety)

API exports `AppType`; app consumes via `hono/client`. Routes **must be chained** — `app.use`/`app.onError` don't accumulate types. Don't reintroduce `registerXxx(c, app)` — loses chained `.route()` and breaks `AppType`.

**Exception — `/api/v1` is deliberately outside `AppType`.** `createPublicApiV1(deps)` is mounted with `app.route("/api/v1", ...)` before the `const routes = app.get(...).route(...)` chain. It is **not** chained into `routes` and therefore not part of `AppType`. This is intentional: `/api/v1` serves external PAT consumers, not the typed RPC client. Adding it to the chain would expose every public-API route to `hcWithType`, which the internal client does not need, and would impose `AppType`'s session-based `Variables` shape on routes that carry `ApiTokenVariables`. If you see a new route file under `public-api/` that isn't in `AppType`, this is correct — do not chain it.

`apps/api/package.json` subpath exports: `.` → `AppType`+runtime; `./client` → `hcWithType`.

- **Trailing-slash normalize the `baseUrl`** — `hc` drops the last segment if missing.
- **`AbortSignal`** via per-call second arg → `await $get({}, { init: { signal } })`.
- **Type sharing**: `InferRequestType<typeof $endpoint>["json"]` + `InferResponseType<typeof $endpoint, 200>`.
- **Errors stay `throw on !res.ok`** — `ApplyGlobalResponse` widens types but no discriminated union.

## Logging & error handling

**No `console.*` in production** — all logs through `pino` (JSON stdout in prod, `pino-pretty` in dev). HTTP: `hono-pino` with `referRequestIdKey: "requestId"`; status-driven log level (`5xx→error`, `4xx→warn`, `2xx/3xx→info`).

**One `app.onError(...)`, no per-route `try/catch`**: `createErrorHandler(instrumentation)` called once in `app.ts`, `di` already built (`container.ts`). **Why factory**: avoids a runtime cycle if any module ever imports `shared/middleware/` — factory takes the dep as parameter, stays cycle-immune. Envelope: `HTTPException` → `{ error: { code, message, requestId } }` (logged at `error` only ≥ 500). Unknown → `500 INTERNAL_ERROR` (stack only outside prod).

Domain & application use `Result<T, E>` (no throw); controller translates → `HTTPException`. Never invent custom per-route error envelopes.

## Observability (`IInstrumentation`)

**Single port, DI everywhere.** `IInstrumentation` (`shared/ports/instrumentation.port.ts`) combines `startSpan` + `capture` + `addBreadcrumb` + `setSpanAttributes`. Default: `NoOpInstrumentation`; `SentryInstrumentation` swaps in when `env.SENTRY_DSN` is set. **No module-level singleton, no service-locator** — every I/O class receives it via constructor. Sentry SDK init exception: `import "./shared/services/sentry-init"` as the first import of `index.ts` (must hook async-hooks before pino/Hono/Drizzle).

**Instrumentation pattern** (see [`docs/OBSERVABILITY.md`](../../docs/OBSERVABILITY.md)):
- **Outer span** wraps the method body: `{ name: "ClassName > methodName" }`. No `op`, no attributes.
- **Inner span** wraps `query.execute()` / `client.send()` / `fetch()`: `{ name: query.toSQL().sql, op: "db.query", attributes: { "db.system.name": "postgresql" } }` (or `op: "http.client"`).
- **`const exec = tx ?? db`** outside the `startSpan` callback.
- **catch + `this.instrumentation.capture(err)`** + return `Result.fail(...)` or rethrow. Never swallow.
- **Multi-query methods** (e.g. `executeWipe`): outer span only — inner spans become noise.
- **Don't call sibling-repo methods from inside a span** — their inner spans become orphaned siblings, not children. Inline the query instead.

## Organization scoping (server)

1. **Ownership at port (`ScopedRepository`), not route.** `requireOrg` exposes `c.var.orgId`; controller builds `RepoScope.org(orgId)` and passes to the use case; `requireOrgPermission` gates capabilities. Skipping `requireOrg` on a handler reading/writing `organizationId`-scoped rows silently accepts requests with no active org.
2. **Queries (CQRS read side) take the same `RepoScope` and AND-join in `WHERE`.** Signature `(input, scope: RepoScope) => Promise<...>`. Promote a `withScope(table, scope)` helper on 2nd occurrence.
3. **Every business table from its first migration owns `organizationId NOT NULL` + FK `organization(id) ON DELETE CASCADE`.** Post-hoc multi-tenancy is the most expensive refactor class. Never skip — even solo-product today.
4. **Personal org never special-cased except via `isPersonalOrg(slug)`** (`slug = personal-${orgId}`, `name = "Personal"`). No `isPersonal` flag. Can't be deleted (`beforeDeleteOrganization` rejects) or left — removal via account deletion (cascades). **Why**: 1:1 with user; standalone deletion orphans them.
5. **Personal self-heals at every sign-in; non-Personal auto-collapses when last member leaves.** `ensurePersonalOrgFor(userId)` in `databaseHooks.user.create.after` AND `session.create.before`. `organizationHooks.afterRemoveMember` deletes empty non-Personal orgs. Never duplicate inline.
6. **Authorization is capability-based, defined once in `@packages/access-control`.** Exports `ac`, `roles = { owner, admin, member }`, `OrgRole`/`OrgPermissions`, `authorizeRole`. The `as unknown as AccessControl` cast stays inside the package. **Why**: duplicated role/statement tuples front+back is the most common drift in multi-tenant SaaS — describe the capability, never hardcode tuples.
7. **Server gate**: `requireOrgPermission(permissions)` — same `OrgPermissions` shape as front. Defense in depth (server enforces, route gate prevents, UI hides).
