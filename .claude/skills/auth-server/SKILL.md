---
name: auth-server
description: Use when working on BetterAuth server-side, the request pipeline, session middleware, rate limiting, CSRF, cookies, or auth email URLs. Trigger on "BetterAuth", "auth.ts", "sessionMiddleware", "requireCsrf", "rate-limit", "cookie", "sign-in", "session". Not for front auth-client or org permissions.
---

# Auth (BetterAuth integration, server)

**Module-level singleton** (`src/auth.ts`), not wrapped in port/adapter, not in DI (wrapping recopies `auth.api.*` and loses `auth.$Infer.*`). Every consumer imports `auth` directly. **No inline `db.*` in `auth.ts`**, SQL lives in `auth-queries.ts` as typed Drizzle functions reading `resolveExecutor()`. Auth is infra, not domain: no repository, no port, no DI.

## Server pipeline (in order, `index.ts`)

`/csp-report` (own cors + rate-limit, before globals to preserve cross-origin CORP) → `requestId()` → `httpLogger` → `secureHeaders()`+`cors()` → `sessionMiddleware` (single `auth.api.getSession()`, stores user/session on ctx, skips `/api/auth/*`) → `requireRateLimit(GLOBAL_POLICY)` + auth-burst per-route → `requireCsrf` on `CSRF_GUARDED_PATHS` in `app.ts` (`/me`,`/uploads`,`/settings`,`/admin`,`/consents`,`/billing/portal`,`/notifications`) → `app.on(["GET","POST"], "/api/auth/*", auth.handler)` → business routes → `app.onError(errorHandler)`.

Protected handlers compose `requireAuth`. **Never re-call `auth.api.getSession()` per handler.**

## Security middleware (`shared/middleware/`)

- **Rate-limit** (`requireRateLimit`): policies in `rate-limit.policies.ts`. **Fail-closed on auth-sensitive policies** → 503 `RATE_LIMITER_UNAVAILABLE` on store error (store outage must not silently disable brute-force protection: OWASP A10:2025); GLOBAL/CSP stay fail-open. IP via `resolveClientIp` (OWASP rightmost-non-trusted; `TRUSTED_PROXIES` accepts `private`/CIDR/exact via `node:net` BlockList). BetterAuth `rateLimit` disabled, single envelope. Postgres store uses a **dedicated pool** (`getRateLimitDbClient()`, `storeFactoryFor(env.RATE_LIMIT_STORE, ...)`) isolated from the app pool, flood must not exhaust business query connections.
- **CSRF** (`requireCsrf`): validates `Origin` against CORS allowlist on unsafe methods (Origin-based, **not** double-submit, cross-origin deploy makes a readable double-submit cookie impossible). Bearer requests skip (no ambient cookie). Rejection: 403 `SECURITY_CSRF_FORBIDDEN` + `security.csrf.rejected` event (reason in audit only, never the response). Exempt: `/api/auth/*`, `/internal/*`. `env.CORS_ORIGIN` is the single allowlist feeding `cors()`, `requireCsrf`, and BetterAuth.

- **Behavioural signals and captcha** (off by default, env in `.env.example`): `SecuritySignalsService` and the optional captcha step of `requireRateLimit`. Geo headers go through `IIpGeoService` and `getVisitorGeo()`, never `c.req.header` or `ctx.headers`: trust depends on the env naming the header and on the peer being a trusted proxy. Inventory: `docs/FEATURES.md`.

## Defaults

`session.cookieCache: { enabled: true, maxAge: 60 }` (signature-only check between DB refreshes; keep `maxAge` ≤ 15 min for near-instant revoke, reduced to 60 s to make account bans effective within 1 min).

`bearer()` alongside cookies, web uses cookies (httpOnly, XSS-safe), Capacitor uses bearer. Cookies: `httpOnly`, `secure: isProd`, `sameSite: isProd ? "none" : "lax"`, `none` because SPA+API are distinct origins; CSRF covered by `requireCsrf` (Origin allowlist). Same-site deploy → switch to `"lax"`.

## Email URLs route through the app

`${env.APP_URL}/<route>?token=...` (opaque) or `${env.APP_URL}/<route>/<id>`. **Why**: branded UX; Outlook/Gmail mangle `?callbackURL=...` in API URLs. Don't pass `redirectTo`/`callbackURL` to auth-client methods when a `send*` server hook already builds the URL, silently overrides the canonical URL. One exception: `sendVerificationEmail` and `sendMagicLink` read `callbackURL` to carry a same-origin path as `redirect` on the app URL (`shared/auth/email-redirect.ts`), which the front revalidates. Never pass it to `signIn.email`: its response then makes the client hard-navigate.

## Don't re-implement the organization plugin

Don't re-implement `auth.api.organization.*` server-side or attach `requireOrgPermission` to plugin endpoints, the plugin owns role checks for `/api/auth/organization/*`. Custom guards apply to business routes only.

## Reconciliation at login: reusable pattern

To run code at every login across all flows (password/passkey/magic-link/2FA/OAuth) with access to request cookies, use **`hooks.after` + `createAuthMiddleware` + `ctx.context.newSession`**. Do NOT use `databaseHooks.session.create`, that hook has no access to `Request` headers (no cookies).

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

`ctx.context.newSession` is set on every login (all flows), `null` on regular session checks, the idiomatic "a login just happened" signal. **Order**: `hooks.after` runs before plugin hooks, so it still sees the session a 2FA challenge is about to delete; code that must only see a completed sign-in lives in a plugin listed after `twoFactor` (`securitySignalsPlugin`). Wiring `databaseHooks.session.create` misses cookies; wiring a specific path misses other flows.
