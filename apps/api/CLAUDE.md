# API rules

Hono on Bun, the composition root of the `@modules/*` packages: inwire DI, BetterAuth, Drizzle, storage, org scoping. Auto-loaded under `apps/api/`. Cross-cutting rules: `/CLAUDE.md`. Module rules (anatomy, layers, ports, DI and events as a module author sees them): `modules/CLAUDE.md`. Package contracts it builds on: `packages/ddd-kit`, `packages/drizzle`, `packages/access-control`, `packages/events` (each has its own `CLAUDE.md`).

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

## Layout (host)

Business modules are `@modules/<name>` packages under `/modules` (`modules/CLAUDE.md`); this app composes them.

```
apps/api/src/
  shared/                       Host platform, see "Host platform" below
  composition/                  Host side of the module contract, see "DI" below
    settings.ts                 `apiSettings(env)`: env mapped once onto each module's typed settings and onto `authSettings`
    sources/<consumer>.ts       Binds a port a module declares to what the host or another module provides; `sources/auth.ts` binds the ports `auth/` declares and assembles the `authDeps` key
    route-guards.ts             `routeGuards`: the `RouteGuards` of `@packages/http` built from `shared/middleware`
    auth-provider.ts            `BetterAuthProvider`, the `IAuthProvider` of `@modules/admin` bound to the auth instance
  queries/                      Reads joining tables of several modules, behind a port a module declares (contract 5 of `modules/CLAUDE.md`)
  health/, organization/        Host folders, not isolated modules: the health registry, probes and routes; the organization routes and `scim-connection.service.ts`
  public-api/                   External API surface (`/api/v1/*`), token-authenticated, no session middleware. See the AppType exception below.
    v1/                         Route files exposed to PAT consumers (opt-in only, each route file is explicit)
    index.ts                    `createPublicApiV1(deps)` factory, mounts `requireApiToken` + dual rate-limit
    require-scope.ts            `requireScope(scope)` guard used inside `/api/v1/*` route files
  cron/                         Standalone cron entrypoints (`sweep.ts`, `rgpd-sweep.ts`, `flush-notification-emails.ts`) over one runner (`internal-job.ts`), each its own process, see `docs/CRON.md`
  container.ts                  Composition root: `.add()` cross-cutting + `.addModule()` per module and per source + `.build()`
  auth/                         BetterAuth singleton, deliberate exception to the modules rule (config-as-code, the lib owns the model). Routes auto-mount via the plugin (`/api/auth/*`). Every file below `index.ts` reads its collaborators and settings from `AuthDeps`, never from the container or the env, so a guard test builds a real instance with `createAuth(fakeAuthDeps(...))` instead of mocking the container.
    index.ts                    The only file in `auth/` importing the container: `export const auth = createAuth(di.authDeps)`, `SessionUser` / `SessionData`
    create-auth.ts              `createAuth(deps)`: the options and the `plugins` array in its load-bearing order
    deps.ts                     `AuthDeps` (every collaborator and setting `auth/` reads) and `AuthSettings`
    ports.ts                    The ports `auth/` declares for the services it consumes that no shared port covers
    helpers.ts                  `createAuthHelpers(deps)`: the helpers below, built once per instance and handed to plugins and hooks
    plugins/<name>.ts           One factory over `(deps, helpers)` per plugin with hooks or helpers of its own (`stripe`, `organization`, `sso`, `scim`, `clear-expired-ban`, `security-signals`)
    hooks/{before,after,database}.ts   Factories over `(deps, helpers)` for the top-level `hooks.before` / `hooks.after` / `databaseHooks`
    emit.ts, email.ts, visitor.ts, snapshots.ts, personal-org.ts, entitlements.ts, seats.ts, scim-events.ts   Helpers shared by the files above; a plugin file never imports another plugin file and a hook never imports a plugin file
    totp-options.ts             The TOTP digits and period that `twoFactor` and the `ITotpVerifier` implementation both verify with: one source, or enrolment and step-up codes diverge (`check:totp-enrolment`)
    queries.ts                  Typed Drizzle data access for the bridge, plain functions (no port, DI or aggregate: auth is not domain), reading `resolveExecutor()`. Keeps `auth/` config + event wiring only, never inline `db.*`.
  app.ts                        `Hono` construction, chained `.route()` mounts, middleware, `export const routes` / `export type AppType`. No server boot.
  index.ts                      Server entry: explicit `Bun.serve()` handle (kept on `globalThis` so `bun --hot` reloads it instead of rebinding the port), DI preload, worker starts, ordered shutdown steps. Imports `app` from `app.ts`, re-exports `AppType`.
  server-options.ts             `Bun.serve` options derived from config (`idleTimeout` set, so long responses and streams survive)
  migrate.ts                    Migration entry (`pnpm --filter api migrate`); `start` runs it before the server
  client.ts                     `hcWithType` factory, `hc<AppType>` (`AppType` from `app.ts`)
```

**Module boundary, host half.** The api reaches a module only through the `exports` of its `package.json`; `*.module.ts` is imported only by `container.ts` (contract 1 of `modules/CLAUDE.md`), route factories only by `app.ts`.

**Removability.** `trash modules/<x>/`, then drop its `.addModule()` in `container.ts`, its `app.route()` in `app.ts`, its `composition/sources/<x>.ts` and its key in `composition/settings.ts`, and `@modules/<x>` from `apps/api/package.json`; `tsc` points at what remains.

## Host platform (`shared/`)

`apps/api/src/shared` is the platform folder of the host: code that more than one host folder (middleware, auth, public-api, cron, composition) uses and that no module owns. It is not a kernel modules depend on: a module cannot import an app. Inventory by concern (the file-level list is `docs/FEATURES.md`); the rule is where a new file goes: used by one host folder only, it lives in that folder; used by two or more, in `shared/`; owned by one business module, in that module.

- `middleware/`: Hono middlewares (auth, error, logger, org, policy, billing gates, api-token, staff guards, deny-impersonated, rate-limit factory + policies + trusted-proxy IP, CSRF Origin allowlist).
- `internal-routes/`: everything that gates `/internal/*` (cron callers, GH Actions, sidecar schedulers), grouped by concern: `internal-signature.middleware` (server verifier over the HMAC primitives of `@packages/http/internal-signature`), `private-network.middleware` (loopback/RFC1918), `internal-layers` (env-driven composer, the host hands it to module internal routes as `internalGuards`), `internal-fetch` (client-side `signedInternalFetch`, importable by external schedulers). Also the cross-cutting retention sweeps `sweep-<table>.route.ts` (no single module owner; they share `sweep-lock` and `sweep-route` here, whose `tableSweepRoute` builds the single-table routes, and the sweep kit: `sweep-runner`, `sweep-heartbeat` in `@packages/http`, `sweep-purge`, `sweep-count`, `sweep-span` in `@packages/drizzle`), `flush-notification-emails.route.ts`, and the public `csp-report.route.ts` (mounted in `app.ts` before the global middlewares with its own cors + rate-limit, to preserve cross-origin CORP). A cron endpoint owned by one module stays in that module's internal routes.
- `ports/` + `services/`: the ports the host itself consumes (rate limiter, captcha, IP and session geo, password breach, disposable email, user account, TOTP verifier) and their implementations, plus the process-level instrumentation and Sentry init. A port a module consumes is declared in that module (`modules/CLAUDE.md`, Ports), never here.
- `surface/`: back↔front route parity: `back-routes.ts` (live route table from `app.ts`), `front-consumers.ts` (front `api.*.$method` call-site scan), `route-map.ts` (documented per-route intent); `__TESTS__/surface-parity.test.ts` fails on drift. See `docs/SURFACE.md`.
- Kit packages the host builds on, each with its own guide or skill: `packages/http` (request validator, time-id cursor pagination, route-guard contract), `packages/outbox` (outbox port, emit helpers, relay, dispatcher, lease mechanics), `packages/email` (email port, queue, `EmailDeliveryWorker`; `email-delivery` skill).
- `request-context.ts` (request-scoped ALS: request id + trusted-proxy client IP, for BetterAuth hooks that have no Hono context), `shutdown.ts` (`lifecycleState`, `runShutdown` / `installShutdown`: steps in series, each raced against its timeout, a global deadline, exit `0` only when every step finished).
- `env.ts`, `logger.ts`: process-level singletons. `env-bounds.ts` (`validateEnvBounds`) holds the cross-field refinement that fails the boot when the sweep timeouts are not nested; kept out of `env.ts` so a test can call it without a full `.env`. `env-schema.ts` holds the schema and the keys production requires, free of side effects so `infra/coolify` can check the declared api env against it.

## DI (inwire)

A module states what it needs in `<Name>Prerequisites` and what it adds through `.add()`; `container.ts` chains `.addModule(...)`, and inwire refuses at compile time a module whose prerequisites are not on the builder yet or whose keys are already there.

1. **Every host binding a module receives lives in `composition/`**: env mapped to typed settings in `settings.ts`, a consumer's port bound in `sources/<consumer>.ts` (`.add("IBarLookup", (c) => c.BarDirectory)`), `auth/` included (its `AuthDeps` is the `authDeps` key of `sources/auth.ts`), and `app.ts` hands each route factory `di.scope({ routeGuards, ... })`, which also carries the host pieces a route needs beyond the container (`internalGuards`, the sweep runner, a route-specific rate limit, `IAuthProvider` bound to the auth instance). The module side of that contract is `modules/CLAUDE.md`. **Why**: the wiring of every context reads in one folder, so removing a module or a provider fails `tsc` at exactly the lines that named it.
2. **`scope`, never `extend`, to hand the container more keys.** `extend` copies the resolved cache, so a binding resolved after it exists twice (a stateful hub would split); `scope` delegates to the parent. `routeGuards` is not in `container.ts` because the middlewares it wraps import `di` (cycle).
3. **Use `typeof di`** for the runtime shape after `.build()`, not the global `AppDeps` interface.

## Auth bridge and the outbox (host)

Writing and emitting from a module: `modules/CLAUDE.md`, Domain events. What only the host does:

BetterAuth's adapter receives `db` through `asUnitOfWork` (`auth/unit-of-work-adapter.ts`): each transaction it opens is a `runOutermost`, its own connection even inside an app run, so a plugin change commits on its own and the hooks inside it join that transaction. A run that resolves to a failed `Result` makes the adapter's transaction reject, never report success over a rollback. Proven by `check:auth-transaction` and `check:scim-connection`.

An action only the auth library can perform commits on that connection, so it cannot join the run: it goes last in the unit, after the emit, and a refusal returns a failed `Result` that rolls the event back. The exception is a library call whose hooks write and whose errors it swallows (password reset): it goes after the unit, and a request-scoped holder tells whether the hook finished. A second exception is a library call whose result the event must name (an id the library generates, the members its reconciliation removed) or whose return value is the only copy of a credential (SCIM connection tokens): the call goes first inside the serialised unit, its events follow on a savepoint of that unit, and a failed emit is captured, never turned into a failed request, since failing would leave the caller with a revoked credential and no replacement (`ScimConnectionService`). **Why**: the reverse order drops the event on any failure, this one only when the commit itself fails after the library committed; that residual window (an action without its event) is the accepted cost. Everything the library does not own is written directly so it has no window at all, the store then preserves what the library did (fields written, its sign-out events). `AdminModerationService` is the reference.

The host maps the `OUTBOX_*`, `EMAIL_*` and `WEBHOOK_*` knobs of `.env.example` onto the kit; each lease must cover its budget plus the settle margin the kit exports, enforced at boot by `shared/env-bounds.ts`. Proven by `check:outbox-lease`, `check:email-lease`, `check:marksent` and, in its module, `check:webhook-lease`.

Full DX guide, retention map and BetterAuth bridge specifics: `docs/EVENTS.md`.

## Hono RPC (end-to-end type safety)

The API exports `AppType`; the app consumes it via `hono/client`. Routes **must be chained**: `app.use`/`app.onError` don't accumulate types. Don't reintroduce `registerXxx(c, app)`, it loses the chained `.route()` and breaks `AppType`.

**Exception: `/api/v1` is deliberately outside `AppType`.** `createPublicApiV1(deps)` is mounted with `app.route("/api/v1", ...)` before the `const routes = app.get(...).route(...)` chain, so it is not part of `AppType`. **Why**: `/api/v1` serves external PAT consumers, not the typed RPC client; chaining it would expose every public route to `hcWithType`, which the internal client does not need, and would impose `AppType`'s session-based `Variables` shape on routes that carry `ApiTokenVariables`. A new route file under `public-api/` that is not in `AppType` is correct.

`package.json` subpath exports: `.` → `AppType` + runtime; `./app` → the `Hono` app; `./client` → `hcWithType`. Client usage rules live in `apps/app/CLAUDE.md`.

## Logging & error handling

**No `console.*` in production**: all logs go through `pino` (JSON stdout in prod, `pino-pretty` in dev). HTTP: `hono-pino` with `referRequestIdKey: "requestId"`; status-driven level (`5xx` → error, `4xx` → warn, else info).

**One `app.onError(...)`, no per-route `try/catch`**: `createErrorHandler(instrumentation)` is called once in `app.ts`, `di` already built; it binds the envelope of `@packages/http/error-handler` to the api logger and environment, and a module's route test builds that envelope directly. **Why a factory**: it takes the dependency as a parameter, so it stays immune to the runtime cycle that appears if a route factory imported `shared/middleware/`. Envelope: `HTTPException` → `{ error: { code, message, requestId } }` (logged at `error` only for ≥ 500). Unknown → `500 INTERNAL_ERROR` (stack only outside prod).

Domain and application use `Result<T, E>` (no throw); the controller translates to `HTTPException`. Never invent a per-route error envelope. Typed error codes map to HTTP through `httpStatusFromCode` (`*_NOT_FOUND` → 404, `*_FORBIDDEN` → 403).

## Observability (`IInstrumentation`)

**Single port, DI everywhere.** `IInstrumentation` (`@packages/ddd-kit`, so a package can depend on it too) combines `startSpan`, `capture`, `addBreadcrumb`, `setSpanAttributes` (writes onto the span open around the caller, silently dropped outside one) and `flush(timeoutMs)` (drains pending events, resolves `false` when the timeout cut it short; the shutdown calls it last). Default `LoggingInstrumentation` (the logging subclass of the `NoOpInstrumentation` of `@packages/ddd-kit`); `SentryInstrumentation` swaps in when `env.SENTRY_DSN` is set (`container.ts`). **No module-level singleton, no service locator**: every I/O class receives it via constructor. Sentry SDK init exception: `import "./shared/services/sentry-init"` is the first import of `index.ts` (it must hook async-hooks before pino/Hono/Drizzle).

The span and capture pattern every repository and outside call follows: `modules/CLAUDE.md`, Repositories and instrumentation.

## Organization scoping (server)

1. **Ownership at the port (`ScopedRepository`), not the route.** `requireOrg` exposes `c.var.orgId`; the controller builds `RepoScope.org(orgId)` and passes it to the use case; `requireOrgPermission` gates capabilities. Skipping `requireOrg` on a handler that reads or writes `organizationId`-scoped rows silently accepts requests with no active org.
2. **Queries (CQRS read side) take the same `RepoScope` and AND-join it in `WHERE`**: `(input, scope: RepoScope) => Promise<...>`.
3. **Every business table owns `organizationId NOT NULL` + FK `organization(id) ON DELETE CASCADE` from its first migration** (schema rule: `packages/drizzle/CLAUDE.md`). Post-hoc multi-tenancy is the most expensive refactor class; never skip it, even for a solo product today.
4. **Personal org is never special-cased except via `isPersonalOrg(slug)`** (`@packages/access-control`; `slug = personal-${orgId}`). No `isPersonal` flag. It cannot be deleted (`beforeDeleteOrganization` rejects) or left: removal goes through account deletion (cascade). **Why**: it is 1:1 with the user, standalone deletion would orphan them.
5. **Personal self-heals at every sign-in; non-Personal auto-collapses when its last member leaves.** `ensurePersonalOrgFor(userId)` runs in `databaseHooks.user.create.after` AND `session.create.before`; `organizationHooks.afterRemoveMember` deletes empty non-Personal orgs. Never duplicate inline.
6. **Server gate**: `requireOrgPermission(permissions)`, the same `OrgPermissions` shape as the front. Authorization model and defense-in-depth layers: `packages/access-control/CLAUDE.md`.

## Testing

Host tests follow the generic rules of `packages/test/CLAUDE.md`. `shared/__TESTS__/module-isolation.*.test.ts` is the canary pair that fails the moment the runner stops isolating test files.

## Commands

- **Tests**: `pnpm --filter api test` (`bun test --isolate --parallel`); a bare `bun test` drops file isolation. `bunfig.toml` preloads `src/__TESTS__/preload.ts`, which supplies a test-only `INTERNAL_SIGNING_KEY` when none is exported, so a fresh `pnpm bootstrap` runs green.
- **Real-database checks**: `pnpm --filter api check:{fanout,digest,wipe-rollback,uow-rollback,marksent,enqueue,sweep-lock,auth-transaction,scim-seats,scim-connection,outbox-lease,email-lease,admin-staff,admin-atomicity,admin-step-up,admin-approval,admin-ops,admin-accounts,admin-workspace,totp-enrolment}` (scripts in `scripts/`, refuse a non-local database via `@packages/test/require-local-database`, all wired in `.github/workflows/ci.yml`). The checks about one module only live in that module: `pnpm --filter @modules/api-token check:api-token-visibility`, `pnpm --filter @modules/webhooks check:webhook-lease`. Re-run the matching one after touching the code it covers.
