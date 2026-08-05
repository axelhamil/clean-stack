# API rules

Hono on Bun, Clean Architecture + DDD, vertical-slice modules, inwire DI, BetterAuth, Drizzle, storage, org scoping. Auto-loaded under `apps/api/`. Root rules in `/CLAUDE.md`; layer rules in `src/modules/CLAUDE.md` and `src/shared/CLAUDE.md`.

## Layout (vertical slice / modular monolith)

```
apps/api/src/
  shared/                       Cross-cutting infra (no business) — see src/shared/CLAUDE.md
    middleware/                 Hono middlewares: auth, error, logger, org, rate-limit (factory + policies + trusted-proxy IP), csrf (Origin-allowlist)
    internal-routes/            `/internal/*` gate: `internal-signature` (HMAC primitives + server verify middleware), `private-network.middleware` (loopback/RFC1918), `internal-layers` (env-driven composer), `internal-fetch` (client-side signed-fetch)
    ports/                      Cross-context port interfaces
    services/                   Cross-context port impls (when no module owns the impl)
    env.ts, logger.ts           Process-level singletons
    transaction.ts              `type ITransaction = Transaction` — single swap-point exception
  modules/<context>/            See src/modules/CLAUDE.md for layered rules
  container.ts                  Composition root: `.add()` cross-cutting + `.addModule()` per context + `.build()`
  auth.ts                       BetterAuth singleton — deliberate exception to modules/ rule (config-as-code, lib owns model). Routes auto-mount via plugin (`/api/auth/*`).
  auth-queries.ts               Typed Drizzle data-access for the bridge — plain functions (no port/DI/aggregate; auth is not domain), `tx?`-aware. Keeps `auth.ts` config + event-wiring only, never inline `db.*`.
  client.ts, index.ts           `hcWithType` factory / server entry (chained `.route()` preserves `AppType`)
```

**Module boundary.** Within a module, layers import inwards (`infrastructure/` → `application/` → `domain/`). Cross-module: domain events, `shared/ports/`, or `shared/services/` only. **Modules NEVER import each other** — not even ports. `module.ts` imported only by `container.ts`; routes only by `index.ts`. Re-exporting routes from `module.ts` recreates the cycle `module → routes → container → module` (Biome flags).

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

`apps/api/package.json` subpath exports: `.` → `AppType`+runtime; `./client` → `hcWithType`.

- **Trailing-slash normalize the `baseUrl`** — `hc` drops the last segment if missing.
- **`AbortSignal`** via per-call second arg → `await $get({}, { init: { signal } })`.
- **Type sharing**: `InferRequestType<typeof $endpoint>["json"]` + `InferResponseType<typeof $endpoint, 200>`.
- **Errors stay `throw on !res.ok`** — `ApplyGlobalResponse` widens types but no discriminated union.

## Auth (BetterAuth integration, server)

**Module-level singleton** (`src/auth.ts`) — not wrapped in port/adapter, not in DI (wrapping recopies `auth.api.*` and loses `auth.$Infer.*`). Every consumer imports `auth` directly. **No inline `db.*` in `auth.ts`** — SQL lives in `auth-queries.ts` as typed Drizzle functions (`tx?`-aware). Auth is infra, not domain: no repository, no port, no DI.

**Server pipeline** (in order, `index.ts`): `/csp-report` (own cors + rate-limit, before globals to preserve cross-origin CORP) → `requestId()` → `httpLogger` → `secureHeaders()`+`cors()` → `sessionMiddleware` (single `auth.api.getSession()`, stores user/session on ctx, skips `/api/auth/*`) → `requireRateLimit(GLOBAL_POLICY)` + auth-burst per-route → `requireCsrf` on mutation prefixes (`/me`,`/uploads`,`/settings`,`/admin`) → `app.on(["GET","POST"], "/api/auth/*", auth.handler)` → business routes → `app.onError(errorHandler)`. Protected handlers compose `requireAuth`. **Never re-call `auth.api.getSession()` per handler.**

**Security middleware** (`shared/middleware/`):
- **Rate-limit** (`requireRateLimit`): policies in `rate-limit.policies.ts`. **Fail-closed on auth-sensitive policies** → 503 `RATE_LIMITER_UNAVAILABLE` on store error (store outage must not silently disable brute-force protection — OWASP A10:2025); GLOBAL/CSP stay fail-open. IP via `resolveClientIp` (OWASP rightmost-non-trusted; `TRUSTED_PROXIES` accepts `private`/CIDR/exact via `node:net` BlockList). BetterAuth `rateLimit` disabled — single envelope. Postgres store uses a **dedicated pool** (`getRateLimitDbClient()`, `storeFactoryFor(env.RATE_LIMIT_STORE, ...)`) isolated from the app pool — flood must not exhaust business query connections.
- **CSRF** (`requireCsrf`): validates `Origin` against CORS allowlist on unsafe methods (Origin-based, **not** double-submit — cross-origin deploy makes a readable double-submit cookie impossible). Bearer requests skip (no ambient cookie). Rejection: 403 `SECURITY_CSRF_FORBIDDEN` + `security.csrf.rejected` event (reason in audit only, never the response). Exempt: `/api/auth/*`, `/internal/*`. `env.CORS_ORIGIN` is the single allowlist feeding `cors()`, `requireCsrf`, and BetterAuth.

**Defaults**: `session.cookieCache: { enabled: true, maxAge: 60 }` (signature-only check between DB refreshes; keep `maxAge` ≤ 15 min for near-instant revoke — reduced to 60 s to make account bans effective within 1 min). `bearer()` alongside cookies — web uses cookies (httpOnly, XSS-safe), Capacitor uses bearer. Cookies: `httpOnly`, `secure: isProd`, `sameSite: isProd ? "none" : "lax"` — `none` because SPA+API are distinct origins; CSRF covered by `requireCsrf` (Origin allowlist). Same-site deploy → switch to `"lax"`.

**Email URLs route through the app** — `${env.APP_URL}/<route>?token=...` (opaque) or `${env.APP_URL}/<route>/<id>`. **Why**: branded UX; Outlook/Gmail mangle `?callbackURL=...` in API URLs. Don't pass `redirectTo`/`callbackURL` to auth-client methods when a `send*` server hook already builds the URL — silently overrides the canonical URL.

**Don't re-implement `auth.api.organization.*` server-side or attach `requireOrgPermission` to plugin endpoints** — the plugin owns role checks for `/api/auth/organization/*`. Custom guards apply to business routes only.

## Logging & error handling

**No `console.*` in production** — all logs through `pino` (JSON stdout in prod, `pino-pretty` in dev). HTTP: `hono-pino` with `referRequestIdKey: "requestId"`; status-driven log level (`5xx→error`, `4xx→warn`, `2xx/3xx→info`).

**One `app.onError(...)`, no per-route `try/catch`**: `createErrorHandler(instrumentation)` called once in `index.ts` after `di.build()`. **Why factory**: avoids a runtime cycle if any module ever imports `shared/middleware/` — factory takes the dep as parameter, stays cycle-immune. Envelope: `HTTPException` → `{ error: { code, message, requestId } }` (logged at `error` only ≥ 500). Unknown → `500 INTERNAL_ERROR` (stack only outside prod).

Domain & application use `Result<T, E>` (no throw); controller translates → `HTTPException`. Never invent custom per-route error envelopes.

## Observability (`IInstrumentation`)

**Single port, DI everywhere.** `IInstrumentation` (`shared/ports/instrumentation.port.ts`) combines `startSpan` + `capture` + `addBreadcrumb`. Default: `NoOpInstrumentation`; `SentryInstrumentation` swaps in when `env.SENTRY_DSN` is set. **No module-level singleton, no service-locator** — every I/O class receives it via constructor. Sentry SDK init exception: `import "./shared/services/sentry-init"` as the first import of `index.ts` (must hook async-hooks before pino/Hono/Drizzle).

**Instrumentation pattern** (see [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md)):
- **Outer span** wraps the method body: `{ name: "ClassName > methodName" }`. No `op`, no attributes.
- **Inner span** wraps `query.execute()` / `client.send()` / `fetch()`: `{ name: query.toSQL().sql, op: "db.query", attributes: { "db.system.name": "postgresql" } }` (or `op: "http.client"`).
- **`const exec = tx ?? db`** outside the `startSpan` callback.
- **catch + `this.instrumentation.capture(err)`** + return `Result.fail(...)` or rethrow. Never swallow.
- **Multi-query methods** (e.g. `executeWipe`): outer span only — inner spans become noise.
- **Don't call sibling-repo methods from inside a span** — their inner spans become orphaned siblings, not children. Inline the query instead.

## Storage (object-storage-agnostic, S3-compatible)

**Server is blind during upload** — client PUTs directly to provider via presigned URL; API only sees `presign` and `confirm`. Three-step `presign`→`PUT`→`confirm`. **Why three steps**: R2 doesn't support Presigned POST (no `content-length-range`); providers don't verify the signed body — `confirm` (`HeadObject`+`DeleteObject` on mismatch) is the real enforcement. Don't add a Presigned POST flow.

1. **Port = pure transport.** `presignUpload`, `presignDownload`, `headObject`, `deleteObject`, `publicUrlFor`. Zero business rules.
2. **Use-cases enforce owner-scoped key** `<userId>/<scope>/<uuid>-<filename>`; download+confirm reject keys without the requester's `<userId>/` prefix (`*_FORBIDDEN`). No `throw` — `Result<T, Error>`.
3. **Validation at controller boundary** via `zV` (shared `@hono/zod-validator` wrapper that throws `HTTPException(400)`). Use-cases trust input.
4. **Routes = thin controllers.** `statusFor(error)` switch: `*_FORBIDDEN`→403 / `*_NOT_FOUND`→404 / `*_INTEGRITY_FAILED`→422 / `*_PROVIDER_FAILURE`→502.
5. **Provider-agnostic**: `region: "auto"`, `forcePathStyle: true`. Boot-time fail-hard if prod endpoint is localhost or creds are default.
6. **Confirm mandatory**: `HeadObject` actual size/contentType, deletes on mismatch, returns `{ key, size, contentType, publicUrl }`. Trusting client-declared values without `confirm` is the enforcement gap.
7. **Multi-step factory chain**: upload `mutationOptions` resolves only after `confirm` — UI never sees "maybe uploaded".

## Events (transactional outbox)

`IUnitOfWork.run(cb)` opens an `EventCollector`. `repo.save(agg, tx)` calls `trackEventsOnSuccess` → events flushed via `outbox.enqueue` in the same TX (atomicity). Post-commit, `pg_notify` wakes `OutboxDispatcher` → built-in subscribers (audit, webhook) in the dispatch TX, then `onEvent(...)` handlers post-commit (best-effort, isolated).

**BetterAuth → outbox bridge** (`auth.ts`):
- **`databaseHooks` for core models** (user/session/account/verification) — TX-bound, all flows. Used for `USER_CREATED`, `USER_SIGNED_{IN,OUT}`, `USER_ACCOUNT_UNLINKED`.
- **`hooks.after` + `createAuthMiddleware` for plugin events** (twoFactor, passkey, email-verified, password-changed, link-social) — path-based. **Guard `if (ctx.context.returned instanceof APIError) return`** — otherwise events fire on 4xx.
- **`hooks.before` + `createAuthMiddleware` for pre-rejection signals** (abuse-prevention: disposable-email, credential-stuffing, HIBP) — emits before `throw APIError`. **Trap**: `ctx.context.request`/`ctx.context.session` are `undefined` in before-hooks (runs before session middleware) — read IP from `ctx.headers`; load actor via `auth.api.getSession({ headers: ctx.headers })`. Wiring `ctx.context.*` throws before the emit → event silently lost + 500. Only end-to-end tests catch this (unit tests don't mount hooks).
- **Native callbacks**: `emailAndPassword.{sendResetPassword,onPasswordReset}`, `magicLink.sendMagicLink`.

`organizationHooks` covers all org/member/invitation events.

**Hard rules**: `uow.run()` cannot be nested (Drizzle nested TX = independent, not savepoints — guarded by `EventCollector.hasContext()` throw). `addEvent` outside `uow.run()` = events lost (dev-mode warning via `EventCollector.setOutOfContextLogger`).

**Retention**: `outbox_event`, `audit_log`, `webhook_delivery` purged by HMAC-gated `/internal/sweep-*` routes, driven by env knobs `OUTBOX_RETENTION_DAYS` / `AUDIT_LOG_{OPERATIONAL,COMPLIANCE}_RETENTION_DAYS` / `WEBHOOK_DELIVERY_RETENTION_DAYS`. Cron order (FK `ON DELETE RESTRICT`): webhook → audit → outbox. The sweep emits no event (rule §6 exception — see `/CLAUDE.md`).

See [`docs/EVENTS.md`](docs/EVENTS.md) for full spec, retention matrix, and cron recipe.

## Email delivery (`shared/services/`)

**Emails enqueued, never sent inline.** `IEmailService` (`QueuedEmailService`) writes to `email_message` inside the caller's TX when `options.tx` is passed (atomic). `EmailDeliveryWorker` polls every 2 s, delivers via `resend.batch.send` (100 emails/request, 10 req/s ceiling, `batchValidation: "permissive"`).

- **Never call Resend directly from a request path.** Use `di.IEmailService.sendTemplate(...)` or `di.IEmailService.sendTemplateBatch(...)`.
- **Failure is best-effort** — logs at `warn`, never rolls back the caller.
- **`@packages/emails` is the template SSOT.** `TEMPLATE_IDS` in the worker is an override; empty string = render in-repo React Email template. New templates: add to both the package and the `EmailTemplates` port type.
- **Retry via decorrelated jitter** (`shared/jitter.ts`). Exhausted messages emit `email.delivery.exhausted`.

## Policy versioning (`modules/policies/`)

Compliance infra, not DDD. Records which policy version each user accepted and when.

- **`@packages/policies`** is the SSOT (`POLICY_VERSIONS`, `POLICY_TYPES`, `POLICY_CHANGELOG`, `POLICY_URLS`). Bump the version string → every consumer sees the change at compile time. `POLICY_URLS` is the swap point for hosting policy text externally.
- **`PolicyAcceptanceService.accept(userId, types, ipAddress?)`** writes N rows + emits N `user.policy.accepted` events in one `uow.run` TX — any failure throws (no partial acceptance). `getStaleTypes(userId)` drives the gate. `DrizzlePolicyAcceptanceStore` is fully §8-instrumented.
- **`requireCurrentPolicies`** (`shared/middleware/policy.middleware.ts`) — composable, **not mounted globally** — 409 when any policy is stale. `_shell` `beforeLoad` redirect is the UX gate; this middleware is defense-in-depth.
- **Sign-up acceptance via `/verify-email` hook** — called from BetterAuth `/verify-email` after-hook AND from `POST /me/policies/accept`. Not at `/sign-up/email` (no session yet; returns synthetic user on duplicate-email).

## Cookie consent (`modules/consents/`)

Compliance infra, not DDD. Records device-scoped consent (guest→user reconciled at login). Mirrors `modules/policies/` shape.

- **`@packages/cookie-consent`** is the SSOT (`CONSENT_CATEGORIES`, `OPTIONAL_CATEGORIES`, `CONSENT_COOKIE_NAME = "cc_sid"`, `COOKIE_CONSENT_VERSION`, grant/refusal TTL). Bump `COOKIE_CONSENT_VERSION` → all users re-prompted.
- **`ConsentService`**: `record` (append-only, latest wins) · `withdraw` · `getActive` (with subjectId fallback for logged-in users with no record) · `reconcile(subjectId, userId)` (UPDATE `user_id IS NULL` rows). `DrizzleConsentStore` is §8-instrumented.
- **Routes `/consents` — public, `optionalAuth`**. **Rate-limit `CONSENT_POST_POLICY` on POST/DELETE only — GET is exempt**: GET is called on every render prefetch; rate-limiting it saturates the window on normal reloads and blocks the consent banner.
- Cookie `cc_sid`: `httpOnly`, `secure: isProd`, `sameSite: isProd ? "none" : "lax"`, `path: "/"`. **No `__Host-` prefix** — cross-origin deploy requires `sameSite: "none"`, incompatible with `__Host-` (same constraint as the BetterAuth session cookie).
- **Sweep** (`sweep-consents.route.ts`, HMAC-gated): purges `user_id IS NULL AND expires_at < cutoff` (env `CONSENT_RETENTION_DAYS=365`).

**Reconciliation at login — reusable pattern:** to run code at every login across all flows (password/passkey/magic-link/2FA/OAuth) with access to request cookies, use **`hooks.after` + `createAuthMiddleware` + `ctx.context.newSession`**. Do NOT use `databaseHooks.session.create` — that hook has no access to `Request` headers (no cookies).

```ts
hooks: {
  after: createAuthMiddleware(async (ctx) => {
    const userId = ctx.context.newSession?.user?.id; // null outside login → skip
    if (!userId) return;
    const subjectId = readCookieFromHeaders(ctx.headers, CONSENT_COOKIE_NAME);
    if (!subjectId) return;
    await di.ConsentService.reconcile(subjectId, userId);
  }),
}
```

`ctx.context.newSession` is set on every login (all flows), `null` on regular session checks — the idiomatic "a login just happened" signal. Wiring `databaseHooks.session.create` misses cookies; wiring a specific path misses other flows.

## Billing (`modules/billing/` + `stripe()` plugin)

Pragmatic infra, NOT DDD. `config.ts` holds `ENTITLEMENTS[tier]` (features/rank/maxMembers, `null` = unlimited). `@better-auth/stripe` plugin owns subscription state (its `subscription` table, webhook-synced). Stripe owns price/display (`metadata.tier` join key). Typed config is the single business-rules SSOT — never duplicate into a domain model.

**Four gate axes** (independent, never conflated):
1. **Role** — `billing:["read","manage"]` capability (`@packages/access-control`).
2. **Seats** — hard-capped in `beforeAddMember` + `beforeAcceptInvitation` + `beforeCreateInvitation`. **All three must be wired** — missing one silently admits overquota members.
3. **Tier/feature** — `requireFeature(flag)` / `requirePlan(minTier)` → 402 `BILLING_PAYMENT_REQUIRED`.
4. **Quota** (Phase B.2, dormant) — limits in `ENTITLEMENTS[tier].quotas` (`null` = unlimited). `requireQuota(key, readUsage)` = best-effort pre-check → 429 `BILLING_QUOTA_EXCEEDED`; `reserveQuota(tx, orgId, key, limit, countFn)` = **authoritative** gate (TOCTOU-safe: `pg_advisory_xact_lock` + count inside `uow.run()`). Counting: live `countScopedRows` (default) or `IQuotaUsageStore.{increment,current,reset}` (high-volume — increment in same TX as gated write, never background). Details: [`docs/QUOTA-GATING.md`](docs/QUOTA-GATING.md).

No billing backoffice — Stripe Checkout + Billing Portal hosted. `POST /billing/portal` gated `requireOrgPermission({ billing:["manage"] })`.

**Events**: `billing.subscription.{created,updated,cancelled}`, `billing.payment.failed` — from stripe plugin callbacks in `auth.ts` (same BetterAuth bridge pattern). `billing.quota.exceeded` emitted by `requireQuota` only — `reserveQuota` callers emit it themselves.

## Organization scoping (server)

1. **Ownership at port (`ScopedRepository`), not route.** `requireOrg` exposes `c.var.orgId`; controller builds `RepoScope.org(orgId)` and passes to the use case; `requireOrgPermission` gates capabilities. Skipping `requireOrg` on a handler reading/writing `organizationId`-scoped rows silently accepts requests with no active org.
2. **Queries (CQRS read side) take the same `RepoScope` and AND-join in `WHERE`.** Signature `(input, scope: RepoScope) => Promise<...>`. Promote a `withScope(table, scope)` helper on 2nd occurrence.
3. **Every business table from its first migration owns `organizationId NOT NULL` + FK `organization(id) ON DELETE CASCADE`.** Post-hoc multi-tenancy is the most expensive refactor class. Never skip — even solo-product today.
4. **Personal org never special-cased except via `isPersonalOrg(slug)`** (`slug = personal-${orgId}`, `name = "Personal"`). No `isPersonal` flag. Can't be deleted (`beforeDeleteOrganization` rejects) or left — removal via account deletion (cascades). **Why**: 1:1 with user; standalone deletion orphans them.
5. **Personal self-heals at every sign-in; non-Personal auto-collapses when last member leaves.** `ensurePersonalOrgFor(userId)` in `databaseHooks.user.create.after` AND `session.create.before`. `organizationHooks.afterRemoveMember` deletes empty non-Personal orgs. Never duplicate inline.
6. **Authorization is capability-based, defined once in `@packages/access-control`.** Exports `ac`, `roles = { owner, admin, member }`, `OrgRole`/`OrgPermissions`, `authorizeRole`. The `as unknown as AccessControl` cast stays inside the package. **Why**: duplicated role/statement tuples front+back is the most common drift in multi-tenant SaaS — describe the capability, never hardcode tuples.
7. **Server gate**: `requireOrgPermission(permissions)` — same `OrgPermissions` shape as front. Defense in depth (server enforces, route gate prevents, UI hides).
