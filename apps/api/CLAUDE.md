# API rules

Hono on Bun, Clean Architecture + DDD, vertical-slice modules, inwire DI, BetterAuth, Drizzle, storage, org scoping. Loaded automatically by Claude Code when working anywhere under `apps/api/`. Root rules (philosophy, stack, release flow) live in `/CLAUDE.md`. Deeper sub-CLAUDE.md inside `src/modules/` and `src/shared/` carry layer-specific rules.

## Layout (vertical slice / modular monolith)

```
apps/api/src/
  shared/                       Cross-cutting infra (no business) — see src/shared/CLAUDE.md
    middleware/                 Cross-cutting Hono middlewares: auth, error, logger, org
    internal-routes/            Everything that gates `/internal/*` (cron, internal callers): `internal-signature` (HMAC primitives), `internal-signature.middleware` (server verify), `private-network.middleware` (loopback/RFC1918 gate), `internal-layers` (env-driven composer of the two), `internal-fetch` (client-side signed-fetch helper).
    ports/                      Cross-context port interfaces
    services/                   Cross-context port impls (when no module owns the impl)
    env.ts, logger.ts           Process-level singletons
    transaction.ts              `type ITransaction = Transaction` — single swap-point exception
  modules/<context>/            See src/modules/CLAUDE.md for layered rules
  container.ts                  Composition root (flat at `src/`): `.add()` for cross-cutting + `.addModule()` per context, then `.build()`.
  auth.ts                       BetterAuth singleton — **deliberate exception** to modules/ rule (config-as-code, lib owns model). Routes auto-mount via plugin (`/api/auth/*`).
  client.ts, index.ts           `hcWithType` factory / server entry (chained `.route()` preserves `AppType`)
```

**Module boundary.** Within a module, layers import inwards (`infrastructure/` → `application/` → `domain/`). Cross-module communication only via domain events, `shared/ports/`, or `shared/services/`. **Modules NEVER import each other** — not even ports. `module.ts` imported only by `container.ts`; routes only by `index.ts`. Re-exporting routes from `module.ts` re-creates the cycle `module → routes → container → module` (Biome flags).

**Removability.** `trash modules/<context>/` + remove `.addModule()`/`app.route()` lines + `export *` in schema barrel if module owned tables. TS error-points the rest. Shared kernel always has ≥ 2 consumers OR is cross-cutting infra by nature.

## CQRS

- **Commands** (writes): Controller → Use Case → Aggregate → Repository → EventDispatcher → Handlers
- **Queries** (reads): Controller → Query (direct ORM, no use case)

## DI (inwire)

**Pinia-style augmentation — each module declares what it ADDS, not what it consumes.** `container.ts` chains `.addModule(...)`; each `module.ts` augments global `inwire.AppDeps` via `declare module 'inwire'`, then calls `defineModule()` (no generic). `c.X` resolves transparently regardless of module order. Reorder → `tsc` accepts. Forget a binding any module reads → `tsc` rejects.

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
2. **Never `defineModule<TDeps>()`** with explicit generic — fallback for forward-refs only. Pinia-style is SOTA.
3. **`Di = typeof di`** after `.build()` — derived runtime shape. Don't confuse with the global `inwire.AppDeps` interface (typing surface for the augmentation).
4. **All deps via DI** — routes consume by name (`di.XxxUseCase.execute(...)`); never `new Xxx(...)` (bypasses container, breaks per-test impl swap). No service locators.
5. **Transactions managed in controllers**, passed to use cases/services.

## Hono RPC (end-to-end type safety)

API exports `AppType`; app consumes via `hono/client`. Routes **must be chained** to accumulate types — `app.use`/`app.onError` don't add to the typed schema. Paths mirror URL; method `$post`/`$get`. Don't reintroduce a `registerXxx(c, app)` shape — it loses chained `.route()` and breaks `AppType` accumulation.

`apps/api/package.json` has two subpath exports: `.` → `AppType`+server runtime; `./client` → `hcWithType` (pre-typed factory).

- **Trailing-slash normalize the `baseUrl`** — `hc` drops the last segment if missing.
- **`AbortSignal`** via per-call second arg → `await $get({}, { init: { signal } })`.
- **Type sharing**: `InferRequestType<typeof $endpoint>["json"]` + `InferResponseType<typeof $endpoint, 200>`.
- **Errors stay `throw on !res.ok`** — `ApplyGlobalResponse` widens response types but no discriminated union.

## Auth (BetterAuth integration, server)

**Module-level singleton** (`apps/api/src/auth.ts`) — not wrapped in port/adapter, not in DI (wrapping recopies `auth.api.*` and loses `auth.$Infer.*`). Every consumer imports `auth` directly.

**Server pipeline** (in order, `index.ts`): `requestId()` → `httpLogger` → `secureHeaders()`+`cors()` → `sessionMiddleware` (calls `auth.api.getSession()` once, stores `user`/`session` on context, skips `/api/auth/*`) → `app.on(["GET","POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))` → `app.onError(errorHandler)`. Protected handlers compose `requireAuth`. **Never re-call `auth.api.getSession()` per handler.**

**Defaults**: `session.cookieCache: { enabled: true, maxAge: 5*60 }` (signature-only auth check between refreshes; DB is truth at expiry → instant revoke; keep `maxAge` ≤ 15 min). `bearer()` plugin alongside cookies — web cookie-based (httpOnly, XSS-safe), Capacitor uses bearer with secure storage. Cookies: `httpOnly`, `sameSite: "lax"`, `secure: isProd`.

**Email URLs route through the app, not the API** — `${env.APP_URL}/<route>?token=...` (opaque tokens) or `${env.APP_URL}/<route>/<id>` (ID-based). **Why**: branded UX; avoids Outlook/Gmail re-autolinking visible URL text and mangling `?callbackURL=...`. Don't pass `redirectTo`/`callbackURL` to auth-client methods when a `send*` server hook already builds the URL — duplicate dead code can silently override the canonical URL.

**Don't re-implement `auth.api.organization.*` server-side or attach `requireOrgPermission` to plugin endpoints** — the plugin owns role checks for `/api/auth/organization/*`. Custom guards apply to **our** business routes only.

## Logging & error handling

**No `console.*` in production paths** — all logs through `pino` (JSON stdout in prod, `pino-pretty` in dev). HTTP: `hono-pino` with `referRequestIdKey: "requestId"`; status-driven (`5xx→error`, `4xx→warn`, `2xx/3xx→info`).

**One `app.onError(errorHandler)`, no per-route `try/catch`**: `HTTPException` → `{ error: { code: "HTTP_<status>", message, requestId } }` (logged at `error` only when `status >= 500`). Else → `500` `{ error: { code: "INTERNAL_ERROR", message: "Internal Server Error", requestId, stack? } }` (stack only outside production).

**Throwing the right exception is the API.** Domain & application use `Result<T, E>` (no throw); controller translates failures → `HTTPException(<status>, { message })`. Envelope above is the API contract — never invent custom per route.

## Storage (object-storage-agnostic, S3-compatible)

**Server is blind during upload** — client PUTs directly to provider via presigned URL; API only sees `presign` and `confirm`. Three-step `presign`→`PUT`→`confirm`; symmetric download. **Why three steps**: providers like R2 don't support Presigned POST policies (no `content-length-range`, verified 2026). Signed `Content-Length`/`Content-Type` block naïve clients but providers don't verify the body — `confirm` (server `HeadObject`+`DeleteObject` on mismatch) is the real enforcement. Don't add a Presigned POST flow.

1. **Port = pure transport.** Storage port exposes only SDK ops (`presignUpload`, `presignDownload`, `headObject`, `deleteObject`, `publicUrlFor`). Zero business rules.
2. **Use-cases enforce owner-scoped key** `<userId>/<scope>/<uuid>-<filename>`; download+confirm reject keys without the requester's `<userId>/` prefix (`*_FORBIDDEN`). Skipping this lets any authenticated user presign a GET / verify any key. No `throw` — return `Result<T, <Domain>Error>`.
3. **Validation at controller boundary** in DTOs (filename regex, scope regex, size cap, max TTL), via `zV` (shared wrapper of `@hono/zod-validator` that throws `HTTPException(400)` on failure so the 400 doesn't pollute the response union type). Use-cases trust input.
4. **Routes = thin controllers.** DI resolve → `await execute(...)` → `Result` → HTTP via central `statusFor(error)` switch keyed off `*_FORBIDDEN`/`*_NOT_FOUND`/`*_INTEGRITY_FAILED`/`*_PROVIDER_FAILURE` (403/404/422/502).
5. **Provider-agnostic via S3 SDK config**: `region: "auto"`, `forcePathStyle: true`. Boot-time fail-hard if production endpoint is localhost or creds are default.
6. **Confirm mandatory**: `HeadObject`s actual size/contentType, deletes on mismatch, returns server-verified `{ key, size, contentType, publicUrl }`. Size permissive (`actual > expected` fails); content-type strict. Trusting client-declared values without `confirm` is the enforcement gap.
7. **Multi-step factory chain.** The upload `mutationOptions` resolves only after `confirm` succeeds — UI never sees "maybe uploaded".

**Phase 2 (deferred until first concrete consumer)**: orphan GC; integration event bus (`IAppEventBus`, distinct from domain events) when 2+ handlers need an upload-confirmed event.

## Events (transactional outbox)

`IUnitOfWork.run(cb)` opens an `EventCollector` (AsyncLocalStorage). `repo.save(agg, tx)` wraps `trackEventsOnSuccess(result, agg)` to push pulled domain events into the collector. Pre-COMMIT, the UoW flushes them via `outbox.enqueue` in the same TX → atomicity. Post-COMMIT, Postgres `pg_notify` wakes `OutboxDispatcher` which fans out to built-in subscribers (audit, webhook fanout) inside the dispatch TX, then to user-defined `onEvent(...)` handlers post-commit (best-effort, isolated).

**BetterAuth → outbox bridge** lives in `auth.ts` (the documented exception). Two paths:
- **`databaseHooks` for core models** (user/session/account/verification) — TX-bound, captures all flows including non-HTTP. Used for `USER_CREATED`, `USER_SIGNED_{IN,OUT}`, `USER_ACCOUNT_UNLINKED`.
- **`hooks.after` + `createAuthMiddleware` for plugin events** (twoFactor, passkey, email-verified, password-changed, link-social) — path-based, only voie viable since plugin tables aren't exposed in `databaseHooks`. Filter `if (ctx.context.returned instanceof APIError) return` is critical (otherwise events fire on 4xx).
- **Native callbacks** — `emailAndPassword.{sendResetPassword,onPasswordReset}`, `magicLink.sendMagicLink` for the corresponding events.

`organizationHooks` (org plugin) covers all org/member/invitation events.

**Hard rules**: `uow.run()` cannot be nested (Drizzle nested TX = independent, not savepoints — guarded by `EventCollector.hasContext()` throw). `addEvent` outside `uow.run()` = events lost (dev-mode warning logged via `EventCollector.setOutOfContextLogger`).

**Retention**: derived pipeline tables (`outbox_event`, `audit_log`, `webhook_delivery`) grow unbounded — purged by HMAC-gated `/internal/sweep-*` routes (`shared/internal-routes/sweep-*.route.ts`), driven by env knobs `OUTBOX_RETENTION_DAYS` / `AUDIT_LOG_{OPERATIONAL,COMPLIANCE}_RETENTION_DAYS` / `WEBHOOK_DELIVERY_RETENTION_DAYS`. Triggered by external cron in strict order (FK `ON DELETE RESTRICT`): webhook → audit → outbox. The sweep itself emits no event (rule §6 exception — see `/CLAUDE.md`).

See `docs/EVENTS.md` for full spec, retention matrix, and cron recipe.

## Organization scoping (server)

1. **Ownership at port (`ScopedRepository`), not route.** `requireOrg` exposes `c.var.orgId`; controller builds `RepoScope.org(orgId)` and passes to `di.XxxUseCase.execute(input, scope)`; `requireOrgPermission({ resource: ["action"] })` still gates *capabilities*. Routes **construct** scope; repo **honors** it. Skipping `requireOrg` on a handler reading/writing rows scoped by `organizationId` silently accepts requests with no active org.
2. **Queries (CQRS read side) take the same `RepoScope` and AND-join in `WHERE`.** Signature `(input, scope: RepoScope) => Promise<...>`. Promote a `withScope(table, scope)` helper on 2nd occurrence — sugar on top, never substitute for the parameter.
3. **Every business table from its first migration owns `organizationId NOT NULL` + FK `organization(id) ON DELETE CASCADE`.** **Why**: post-hoc multi-tenancy (backfill+orphan handling+query rewrite) is the most expensive class of refactor. Never skip — even solo-product today.
4. **Personal org never special-cased except via `isPersonalOrg(slug)`** (`slug = personal-${orgId}`, `name = "Personal"`). No `isPersonal` flag, no metadata branch. Lifecycle hooks in `auth.ts` — Personal can't be deleted (`beforeDeleteOrganization` rejects) or left; removal goes via account deletion (cascades). **Why**: Personal is auto-created on signup tied 1:1 to user — standalone deletion would orphan them.
5. **Personal self-heals at every sign-in; non-Personal auto-collapses when last member leaves.** An `ensurePersonalOrgFor(userId)` helper runs in `databaseHooks.user.create.after` (signup) AND `session.create.before` (back-fills legacy `activeOrganizationId: null` users). `organizationHooks.afterRemoveMember` deletes empty non-Personal orgs (skipped for Personal). Never duplicate inline.
6. **Authorization is capability-based, defined once in `@packages/access-control`.** Package exports `ac`, `roles = { owner, admin, member }`, types `OrgRole`/`OrgPermissions`, predicate `authorizeRole(role, permissions, connector?)`. The `as unknown as AccessControl` cast required by BetterAuth's generic plugin signature stays *inside* the package. **Why**: roles+statements duplicated front/back is the most common drift in multi-tenant SaaS. Never hardcode role tuples — describe the *capability* (`{ resource: ["action"] }`).
7. **Server gate**: `requireOrgPermission(permissions)` — same `OrgPermissions` shape as front. Defense in depth (server enforces, route gate prevents access, UI hides).
