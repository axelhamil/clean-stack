# ROADMAP

Upcoming integrations, **all SOTA 2026**, **outside DDD** (pragmatic layer: `adapters/`, `routes/`, `_hooks/`). DDD stays reserved for the pure business domain (`domain/`, `application/use-cases/`).

---

## Auth — BetterAuth (end-to-end) ✅ Phase 1 done

**Why**: own the token, multi-provider, typed plugins (Stripe, organizations, 2FA, passkeys, magic-link), DB-backed sessions, first lib that runs natively on Bun + Hono with no hacks.

- [x] Install `better-auth` + Drizzle adapter (`better-auth/adapters/drizzle`)
- [x] Auth schemas generated via `@better-auth/cli generate` → `packages/drizzle/src/schema/auth.ts` (6 tables: user, session, account, verification, two_factor, passkey)
- [x] Hono handler: `app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))`
- [x] React client: `createAuthClient` in `apps/app/src/adapters/auth-client.ts`
- [x] Plugins: `twoFactor`, `passkey`, `magicLink`, `bearer` (mobile/Capacitor-ready). `organization` + `stripe` deferred to their dedicated sections.
- [x] `sessionMiddleware` (`adapters/middleware/auth.middleware.ts`) populates `c.var.user` / `c.var.session` ; companion `requireAuth` middleware throws `HTTPException(401)` on protected handlers.
- [x] Pages `/sign-in`, `/sign-up`, `/forgot-password`, `/verify-email`, `/reset-password`, `/magic-link`, `/two-factor` in `features/auth/`.
- [x] Pathless layouts `routes/_protected.tsx` (block when no session) and `routes/_guest.tsx` (block when already logged in) — single `beforeLoad` shared by all children, URLs unchanged.
- [x] Cookies: `httpOnly` + `sameSite=lax` + `secure` in production.
- [x] **Performance**: `session.cookieCache` (5 min) on the server — auth check is signature-only between refreshes (no DB hit). DB stays the source of truth at expiry → instant revoke on sign-out/ban.
- [x] **Native readiness**: `bearer()` plugin enables `Authorization: Bearer <token>` alongside cookies. Web stays cookie-based (httpOnly, XSS-safe), Capacitor/mobile uses bearer with secure storage. Same session row, transport differs.
- [x] **Email URLs route through the app, not the API** — every email link points to `${APP_URL}/<route>?token=...`. The frontend page consumes the token via the typed client (`authClient.verifyEmail`, `resetPassword`, `magicLink.verify`). No more `callbackURL` mangling by Outlook & co.
- [x] **Pino structured logging + centralised error handler** — `hono-pino` middleware (`adapters/middleware/logger.middleware.ts`), JSON in prod, `pino-pretty` in dev. Single `errorHandler` (`adapters/middleware/error.middleware.ts`) returns `{ error: { code, message, requestId, stack? } }`.
- [x] **Session as TanStack Query, not React state** — `sessionQueryOptions` (`adapters/queries/session.ts`, staleTime 5 min aligned with `cookieCache`). Router context only exposes `queryClient`; gates do `await context.queryClient.ensureQueryData(sessionQueryOptions)` in `beforeLoad`. No `useSession()` React bridge, zero race between nanostores and beforeLoad.
- [x] **Realtime cross-tab session sync** — native `BroadcastChannel('clean-stack-auth')` (`adapters/auth-broadcast.ts`, ~15 LoC, no experimental dep). Auth mutations call `broadcastAuthChange()` after refetching the session query; `app-providers.tsx` listens once and on receive does `refetchQueries(['session']) + router.invalidate()`. Tab A signs out → tab B (idle on `/dashboard`) instantly transitions to `/sign-in` without polling, hard reload, or navigation in B.
- [x] **Strong password schema split** — `_schemas/auth.schema.ts` exposes `passwordSchema` (loose: `min(1)`, used by sign-in to capture, the server validates) and `strongPasswordSchema` (strict: `min(12).max(128)` + lowercase/uppercase/digit, used by sign-up + reset). NIST-aligned: no required special character.
- [x] **StrictMode-safe token consumption** — `useRef(false)` guard in `verify-email.page.tsx` and `magic-link.page.tsx` prevents the dev-only double-fire of single-use tokens.
- [x] Phase 2 — `organization` plugin (see dedicated section).
- [ ] Phase 3 — `@better-auth/stripe` plugin (see dedicated section).

---

## Multi-tenant — BetterAuth `organization` plugin ✅ Phase 2 done

**Why from day one**: migrating single-user → multi-tenant after the fact is hell (backfill `organizationId` everywhere, orphaned owners, rewrite every query). The reverse is free: if it ends up being B2C, every user gets an invisible auto-created "personal org".

- [x] `organization` plugin enabled in the `auth` config
- [x] Drizzle schemas generated: `organization`, `member`, `invitation` (+ `team` if needed)
- [x] Auto-create a personal org on signup (`databaseHooks.user.create.after`)
- [x] Session enriched with `activeOrganizationId` → Hono middleware that pushes it into `c.var.orgId`
- [x] **Every business table** has an `organizationId` FK from the very first migration (never added later)
- [x] Drizzle helper `withOrg(qb, orgId)` to systematically scope queries
- [x] Pages: `/org/new`, `/org/settings`, `/org/members`, `/org/invitations` in `features/organization/`
- [x] Org switcher in the header (`authClient.organization.setActive(id)`)
- [x] Email invitations (dedicated Resend template)
- [x] Roles: `owner`, `admin`, `member` (custom roles later if needed)
- [x] Stripe customer = **per organization**, not per user (the Stripe plugin supports it natively)

---

## Billing — Stripe via the BetterAuth plugin

**Why**: `@better-auth/stripe` (official, late 2025) wraps customer creation, subscriptions, customer portal, webhooks, DB sync. No more 600 lines of hand-written Stripe glue.

- [ ] Install `@better-auth/stripe` + the `stripe` SDK
- [ ] Plugin declared in the `auth` config: products, prices, trial, webhook secret
- [ ] Webhook endpoint auto-mounted by the plugin → `/api/auth/stripe/webhook`
- [ ] Customer Portal: button calling `authClient.subscription.billingPortal()`
- [ ] Checkout: `authClient.subscription.upgrade({ plan: "pro" })`
- [ ] `useSubscription()` hook in `apps/app/src/adapters/queries/` (cross-feature)
- [ ] UI gating via `subscription.status === "active"` (no custom feature flag)
- [ ] Stripe tests via `stripe listen` in dev (forward webhooks)

---

## Feature gating & quota gating — guards (implementation TBD)

**Why**: gating is *not* DDD — the rule fits in `array.includes()` / `count(*)` / config lookup. Wrapping it in aggregates + use-cases is the OpenUp anti-pattern (~6.4k LOC for what 330 LOC of config + guard would cover). Stay in pragmatic infra: typed plan config + Hono guard middlewares on the API + React hook on the app.

**Shape (target, not committed)**:

- Typed plan catalog (e.g. `PLANS = { free: { features: [...], quotas: { uploads: 10, ... } }, pro: { ... } }`) — single source of truth, fed by the Stripe plugin's active subscription.
- API: `requireFeature("x")` + `requireQuota("uploads")` Hono guard middlewares composed per-route, drawing the active plan from session/org. Same composition pattern as `requireAuth` (rule 14 — promote on second occurrence).
- App: `useEntitlements()` hook for UI gating (disable buttons, hide tabs) — never the only check, server guard is authoritative.
- Quota counters: live in DB tables scoped by `organizationId`, incremented in the same transaction as the gated write.

**Open questions before implementing**:

- [ ] Source of plan: read straight from `subscription.status` + `subscription.priceId` (Stripe plugin), or denormalize into an `entitlement` table for faster reads / offline reasoning?
- [ ] Quota window semantics: rolling 30d, calendar month aligned with billing period, or hard lifetime caps? Each has different counter-reset complexity.
- [ ] Soft vs hard gates: 402 `PAYMENT_REQUIRED` immediately, or warn at 80% + block at 100% with a dedicated UX flow?
- [ ] Per-org overrides for sales-led deals (custom quotas above plan baseline) — config table or Stripe metadata?
- [ ] Caching: plan/entitlement reads on every gated route — cache on session (5 min, like auth) or per-request only?

Depends on **Billing** (Stripe plugin must be live) and **Multi-tenant** (quota is per-org, not per-user).

---

## Admin & impersonation — BetterAuth `admin` plugin

**Why**: every paid SaaS needs (1) staff debugging a paying user's issue without "share your password" gymnastics, (2) ban abusive users without DB surgery, (3) read-only support access. BetterAuth ships an official `admin` plugin (late 2025) wrapping these primitives — no rolling our own. Stays infra (no DDD), gated by platform-level role, every action audited.

- [ ] `admin` plugin enabled in `auth` config (server) + on `authClient` (client)
- [ ] Drizzle schema regenerated (adds platform `role` on `user` + ban fields). Platform roles `admin` / `support` (read-only) are **distinct from org roles** (`owner` / `admin` / `member`).
- [ ] `requireAdmin` Hono middleware (mirror of `requireAuth`, throws 403 when role ∉ allowed set). Composable per-route like the rest.
- [ ] **Impersonation flow** — `authClient.admin.impersonateUser(id)` issues a short-lived impersonation session (default 1h, configurable). Original admin session preserved server-side, restored on `stopImpersonating()`. Front banner non-dismissable, distinct color (`bg-destructive`), visible on every page during impersonation. Start + stop = `recordAudit(...)` (cf audit log section).
- [ ] **Ban / unban** — `authClient.admin.banUser(id, reason)` revokes all sessions and blocks future sign-in (BetterAuth handles the session invalidation). `unbanUser(id)` symmetric. Reason captured in audit log.
- [ ] **Force password reset** — `authClient.admin.setUserPassword(id)` invalidates current sessions, sends magic-link via existing Resend template.
- [ ] Pages in `features/admin/`: `/admin/users` (list, search, filter by org / status / role), `/admin/users/:id` (detail + actions), `/admin/orgs`, `/admin/orgs/:id`.
- [ ] **Front gate** `routes/_admin.tsx` (pathless layout) — `beforeLoad` checks `session.user.role ∈ ["admin", "support"]`, **else 404, not 403** (don't leak the existence of `/admin/*` to non-admins).
- [ ] **Never serve `/admin/*` from the public hostname in production** — separate subdomain (`admin.<APP_DOMAIN>`) or env-flagged. Reduces credential-stuffing surface on a known URL.
- [ ] No new DDD here — `admin` lives in `features/admin/` (front) + `routes/admin/*` (api), guarded by `requireAdmin`. Same pragmatic shape as gating.

---

## Audit log — append-only event trail

**Why**: compliance (SOC2 §CC7.2, GDPR Art. 30, ISO 27001) requires a tamper-evident trail of who did what when. Operational value too — debugging "who changed this user's email at 3am" without `git log`-style detective work. Append-only, scoped by org, never mutated after write.

- [ ] Drizzle schema `audit_log`: `id`, `organizationId` (FK, **nullable** for platform-level events like impersonation), `actorId`, `actorType` (`user` | `admin` | `system`), `action` (snake_case verb, e.g. `user.ban`, `subscription.upgrade`, `org.member.invite`, `data.export.requested`), `targetType` + `targetId` (soft FK, no DB constraint — survives delete), `metadata` (`jsonb`: diff before/after, reason, IP, UA), `createdAt`. **No `updatedAt` / `deletedAt`** — append-only is the contract.
- [ ] **Helper `recordAudit(deps, { action, target, metadata })`** injected via inwire, called **explicitly** from use-cases on state-changing ops. No global ORM hook — rule 6 (explicit DI > magic) applies; magic hooks fire on internal background ops too and pollute the trail.
- [ ] **Phase-1 audited actions (mandatory)**: every `auth.admin.*` (impersonate start/stop, ban, unban, password reset), `subscription.*` (upgrade, cancel, plan change, payment failure), `organization.*` (create, member invite/remove/role change, owner transfer), `user.delete*` (request, cancel, complete — cf GDPR section), `data.export.*`.
- [ ] **Retention** driven by an enum column `retention` on the row. `operational` (90d, debug-grade) vs `compliance` (7y, auth/billing/GDPR-relevant). Cron purges expired `operational` rows; `compliance` rows are immutable for the legal period.
- [ ] Indexes: `(organizationId, createdAt DESC)` + `(actorId, createdAt DESC)` cover the two main read paths.
- [ ] Page `/admin/audit-log` (admin only, gated by `_admin.tsx`) with filters (actor, action, target, range). Each row expandable to show `metadata` diff.
- [ ] **Tamper-evidence (deferred phase 2)** — `prevHash` column chaining each row's hash to the previous one. Detects DB tampering; not crypto-strong but raises the bar. Promote when SOC2 audit demands it (rule 14).
- [ ] **Cross-cutting rule extension**: any new use-case that mutates `user`, `organization`, `subscription`, `member`, `invitation` MUST call `recordAudit(...)` in the same transaction as the write. Reviewer checklist item.

---

## GDPR / CCPA — data deletion + export

**Why**: Art. 17 (right to erasure) and Art. 20 (data portability) are mandatory in EU; CCPA mirrors them in California. Both are user-facing rights, not back-office support tickets — build the cascade clean once or pay forever in ad-hoc DB surgery. **Depends on background jobs** (queue is a prerequisite — to be added before this phase ships; Inngest is the target).

- [ ] **Export endpoint** `POST /me/export` — auth-gated, enqueues a job that walks all tables filtered by `userId` / their orgs, serializes to JSON, uploads to R2 under `<userId>/exports/<uuid>.json`, signs a 7-day download URL, emails the link via Resend template `RESEND_TPL_DATA_EXPORT_*`. **Idempotency-Key on the job** to dedupe double-clicks; rate-limit at 1/24h per user.
- [ ] **Delete endpoint** `POST /me/delete` — auth **+ 2FA-required** (BetterAuth `twoFactor` plugin already enabled) + **7-day soft-delete grace** (status `pending_deletion`, user can still sign in to cancel — explicit consent UX). After grace window expires, a cron job processes pending deletions:
  - **Personal data wiped**: `user.email`, `user.name`, profile images deleted from R2, all sessions revoked, MFA factors removed, passkeys removed.
  - **Business data depends on org context**: sole owner of an org → **block** deletion until org is transferred or deleted (forces explicit choice in the cancel-grace UI, not silent fail). Member → row anonymized in `member` (`userId → null`, `email → deleted-<uuid>@anonymized.local`).
  - **Stripe**: customer deleted via the BetterAuth Stripe plugin. Refund / proration policy = config decision (out of scope for this section, captured as a billing question).
  - **Audit log entries**: **kept** (legal retention 7y) but `actorId` becomes a tombstone reference; original email replaced with `deleted-<uuid>@anonymized.local`. The trail survives the deletion — that's the compliance promise.
- [ ] **GDPR is the only acceptable soft-delete in the codebase** — `user.deletedAt` + `user.pendingDeletionUntil` are the lone soft-delete columns. Every other table stays hard-delete (rule 14 — no creep, no "while we're at it" soft-deletes elsewhere).
- [ ] **Cancel-deletion UX**: any sign-in during the grace window prompts "Your account is scheduled for deletion in N days. [Cancel deletion] [Continue and sign out]". Cancellation = `audit.user.delete.cancelled`.
- [ ] **Admin overrides** at `/admin/users/:id`: trigger an export on user's behalf (support workflow, audited as `data.export.requested` with `actorType: admin`); cannot cancel a user's deletion request without a documented reason in `metadata.reason` (audit-log enforced).
- [ ] **E2E gate in CI** — Playwright scenario: sign up → upload avatar → request export → fetch export → request delete → simulate grace expiry → verify (a) every `userId` reference is gone or anonymized, (b) audit log retains the chain. Without this gate, deletion silently leaves orphaned rows and the compliance claim is theatre.
- [ ] **Public `/legal/data-rights` page** linked from `/settings/account`, listing exactly what's deleted, what's anonymized, and what's retained (with legal basis per category). Required by GDPR transparency obligations; also good copy for trust.
- [ ] **Audit-log integration** (cf section above) — every transition of the deletion state machine (`requested`, `cancelled`, `grace_expired`, `completed`) gets `recordAudit(...)` with `retention: compliance`.

---

## Email — Resend (dashboard templates) ✅ Phase 1 done

**Why**: templates managed from the Resend dashboard (no code, no rebuild to change wording), built-in versioning, native A/B test. Stays pragmatic: we just call the API by template ID.

- [x] Install `resend`
- [x] Port `IEmailService` (`apps/api/src/application/ports/email.port.ts`) + adapter `ResendEmailService` (`apps/api/src/adapters/services/email.service.ts`) wired through inwire DI in **contract mode** (key = interface name `IEmailService`).
- [x] **Type-safe variables per template** — `EmailTemplates` maps each template name to its required variables. Adding a new template = updating the type + adding a `RESEND_TPL_*` env var. Renaming a variable in the dashboard without updating code = TS red, no silent break.
- [x] **`Result<void, EmailError>`** — `sendTemplate` never throws, returns a discriminated `EmailError` (`EMAIL_TRANSPORT_NOT_CONFIGURED` | `EMAIL_PROVIDER_FAILURE`). Use cases keep the `Result` until the controller boundary; integration adapters (`auth.ts`) translate to `throw` only at the BetterAuth-hook frontier.
- [x] **Retry with exponential backoff** — 3 attempts (1s/2s/4s), retry only on `429` and `5xx` + network errors (`status === 0`). 4xx non-rate-limit fail fast (validation = retry futile). Distinct `STATUS_HINTS` log per `401` / `403` / `409` / `422` so prod debug isn't blind.
- [x] **`Idempotency-Key`** — `${event-type}/${sha256(token)[:32]}` (Resend pattern, 24h window). Hash via `Bun.CryptoHasher`. Safe under retries — same payload returns the original response, different payload returns 409 with explicit log hint.
- [x] **`SendTemplateOptions.from?`** — per-tenant `from` override slot for the future `organization` plugin (per-org sending domain). Defaults to `env.RESEND_FROM`. Adding it now = zero breaking change in phase 2.
- [x] **`SendTemplateOptions.locale?`** — slot reserved for the i18n phase. Adapter currently logs a warn ("not yet implemented") if passed; resolution will switch to `${template}_${locale}` env lookup when locale-prefixed templates land. Port stays stable.
- [x] **Boot-time fail-hard in production** — constructor throws if `NODE_ENV === "production"` and `RESEND_API_KEY` or any template ID is missing. Prevents a silent deploy where every transactional email is dropped. Dev mode keeps the warn-only fallback.
- [x] BetterAuth `sendVerificationEmail` / `sendResetPassword` / `magicLink.sendMagicLink` consume `di.IEmailService.sendTemplate` via a `dispatchEmail()` helper that unwraps `Result` (`EMAIL_PROVIDER_FAILURE` → throw → centralised error handler; `EMAIL_TRANSPORT_NOT_CONFIGURED` → `logger.warn`, never silent).
- [x] **IP reputation guarded by Resend, not by us** — Resend ships a domain-scoped suppression list since 2025: hard bounces and spam complaints auto-add the address; future sends to a suppressed address are blocked at the provider edge with a 422 + `email.suppressed` webhook event. **No own suppression table needed** until a product feature actually consumes it (org invitations gating, account-settings "your email bounces" UI, abuse detection). Building it earlier is the OpenUp anti-pattern: ~150 LOC + 2 tables sitting empty until the first consumer arrives. Promote on second occurrence (rule 14), not in anticipation. The webhook integration (`POST /webhooks/resend`, `resend.webhooks.verify()` first-party SDK helper, Svix HMAC, `svix-id` dedupe) ships when the first consumer lands.
- [x] **DNS** documented in `README.md` (SPF + DKIM CNAMEs from Resend dashboard + DMARC TXT progression `p=none` → `p=quarantine` once stable, target `p=reject`). **Mandatory before any production send** — Gmail (Feb 2024), Yahoo (Feb 2024), Microsoft Outlook (May 2025) all reject unauthenticated bulk senders with 550 5.7.515.
- [ ] **Deferred to first product consumer**: webhook + own suppression table + `List-Unsubscribe` / `List-Unsubscribe-Post` (RFC 8058) headers. The unsubscribe headers are required by Gmail/Yahoo/Microsoft only for bulk senders (>5k/day) — irrelevant for transactional auth, mandatory before the first marketing/notification opt-in flow ships.

---

## Storage — Cloudflare R2 (prod) + MinIO (dev) ✅ Phase 1 done

**Why**: R2 = no egress fees, S3-compatible, SigV4 only. MinIO local = same S3 API → one codebase, switched via env. **R2 drives the design** (MinIO is for dev convenience, not a target).

**R2 quirks that shape the design (verified 2026)**: R2 does **not** support Presigned POST policies — only PUT/GET/HEAD/DELETE. There is **no native `content-length-range`** condition. `ContentLength` and `ContentType` passed to a presigned PUT are *signed* (the client must send those exact headers or 403 `SignatureDoesNotMatch`), but R2 does not verify the actual body size against them. Real enforcement therefore requires a **post-upload `HeadObject` + `DeleteObject` on mismatch** step, which is what the `confirm` route does. Object Lock and Bucket Policies are not implemented on R2; do not depend on them.

**Three-step flow**: `presign` → client `PUT` direct to R2 → `confirm` (server `HeadObject`, deletes on size/content-type mismatch).

- [x] MinIO added to `docker-compose.yaml` (ports 9000 API, 9001 console, bucket `clean-stack` auto-created) — dev only.
- [x] Install `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` + `@hono/zod-validator`.
- [x] **Pure transport port** (`apps/api/src/application/ports/storage.port.ts`) — `IStorageService` exposes `presignUpload` / `presignDownload` / `headObject` / `deleteObject` / `publicUrlFor`. Zero business rules; the adapter just signs S3 requests and forwards SDK calls.
- [x] **S3 adapter** (`apps/api/src/adapters/services/storage.service.ts`) — `S3Client` with `region: "auto"` (R2's only accepted value), `forcePathStyle` (kept on for MinIO compat — harmless on R2). Boot-time fail-hard in production if `S3_ENDPOINT` is localhost or creds are default `minioadmin`. Presigned PUT signs `content-type` + `content-length` headers (`signableHeaders`) so the client can't drop them.
- [x] **Use-cases for orchestration only** — `create-upload-url`, `create-download-url`, `confirm-upload` (`apps/api/src/application/use-cases/`). Each gets `IStorageService` via constructor. **Owner-scoping enforced in use-cases**: every key is `<userId>/<scope>/<uuid>-<filename>`; download + confirm reject any key whose prefix is not `<requestingUserId>/` (`STORAGE_FORBIDDEN`). `confirm-upload` performs `HeadObject`, deletes on size/content-type mismatch, returns `STORAGE_INTEGRITY_FAILED`.
- [x] **Validation lives at the controller boundary** — Zod schemas in the route enforce filename regex (`^[\w\-. ]+$`), scope regex (`^[a-z][a-z0-9-]{0,31}$`), max size (`STORAGE_MAX_UPLOAD_BYTES`, default 50 MB), TTL defaults. Zod failures return 400 via the centralised error handler.
- [x] **Per-call granularity**: presign body accepts `scope` (default `"uploads"`) and `expiresInSeconds` (default 5 min for upload / 10 min for download), clamped server-side to `[STORAGE_PRESIGN_TTL_MIN_SECONDS, STORAGE_PRESIGN_TTL_MAX_SECONDS]` (default `[60, 3600]`).
- [x] **Env** (`apps/api/common/env.ts`): `S3_ENDPOINT` (R2 prod: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` or `…eu.r2.cloudflarestorage.com` for EU jurisdiction — once chosen, R2 cannot move the bucket), `S3_REGION` (R2: `auto`), `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`, `S3_PUBLIC_URL`, `STORAGE_MAX_UPLOAD_BYTES`, `STORAGE_PRESIGN_TTL_MIN/MAX_SECONDS`. Dev defaults to MinIO.
- [x] Routes (typed RPC, chained into the `routes` export): `POST /uploads/presign`, `POST /uploads/confirm`, `POST /uploads/download`. All `requireAuth`. Error mapping: 403 (`STORAGE_FORBIDDEN`), 404 (`STORAGE_NOT_FOUND`), 422 (`STORAGE_INTEGRITY_FAILED`), 502 (`STORAGE_PROVIDER_FAILURE`).
- [x] **Flat DI container** (`apps/api/src/di/container.ts`) — inwire infers everything; sections by line comments (`// infra`, `// uploads`). Use-cases registered next to the infra ports they depend on, type-checked by inference (reorder a `.add()` to put a use-case before its port → `tsc` rouge). `AppDeps = typeof di` derived after `.build()`. Promote a section to `modules/<context>.module.ts` only when a bounded context grows large enough to bloat `container.ts`.
- [x] `createUploadMutationOptions` (`apps/app/src/adapters/mutations/create-upload.ts`) — TanStack Query `mutationOptions` factory chaining `presign` → `PUT` direct to R2 (with explicit `Content-Length`) → `confirm`. Returns `{ key, publicUrl, size, contentType }` only after server-verified integrity. Consumed via `useMutation({ ...createUploadMutationOptions, onSuccess, onError })`. Accepts optional `scope` + `expiresInSeconds`.
- [x] **First Hono RPC consumer** — `apps/app/src/adapters/api-client.ts` uses `hcWithType` from `api/client` (subpath export, pre-typed `ApiClient`), with custom `fetch` interceptor (X-Request-Id, slot for 401/Capacitor) and trailing-slash normalization. Future features call the API exclusively through this typed client.
- [ ] MinIO console: http://localhost:9001 (`minioadmin` / `minioadmin`)

---

## i18n — TanStack Router locale routes + typed catalogs

**Why**: most i18n stacks ship as runtime plugins that crash production with missing keys at the worst moment. Bake locale into routing (`/en/...`, `/fr/...`), enforce keys at build time, detect on the server. Zero "Translation missing" string ever shipped.

- [ ] Install `@lingui/core` + `@lingui/react` + `@lingui/cli` (chosen for CLDR plurals + AST extraction; alternative: `next-intl` if SSR streaming becomes a concern)
- [ ] Locale-aware route segment: `routes/$lang/_app/**` with TanStack `parseParams` validating against the supported list (`["en", "fr"]`)
- [ ] Server-side detection in a Hono middleware: `Accept-Language` → 302 to `/en/...` or `/fr/...` if root requested
- [ ] Catalogs in `apps/app/src/locales/<lang>/messages.po`, compiled to `messages.ts` at build time (Vite plugin)
- [ ] Typed message keys: a script generates a `.d.ts` from the source catalog so `t({ id: "…" })` is checked by `tsc`
- [ ] Lang switcher in the header (writes a cookie + navigates to the same path under the new lang)
- [ ] Zod messages localized via `setErrorMap` per lang at the providers boundary
- [ ] Email templates per lang in Resend (`RESEND_TPL_WELCOME_EN`, `_FR`) — picked by user's preferred lang
- [ ] CI gate: `lingui extract --clean` followed by a git diff check — any drift fails the build
- [ ] Date / number / relative-time formatting via `Intl.*` (no extra dep)
- [ ] Skip route segments for assets / API: only the app uses lang prefixes; `/api/*` stays lang-agnostic (locale comes from the user record)

---

## Cross-cutting rules

1. **No DDD for these integrations** — `adapters/services/*` on the api side, `adapters/*` + `_hooks/*` on the app side. If a concept becomes domain (e.g. a `Subscription` with its own rules), promote it into `domain/` then.
2. **Env validated by zod** in `apps/api/common/env.ts` and `apps/app/src/common/env.ts`.
3. **Webhooks**: all under `routes/webhooks/<provider>.ts`, mandatory signature verification before any processing.
4. **Secrets**: never committed, `.env.local` (gitignored) + 1Password/Doppler in production.
