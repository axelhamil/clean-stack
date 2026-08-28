# Features

Inventory of what ships in `clean-stack`. Everything below is wired, tested, and used in the codebase — clone, configure env, ship business logic.

This is the file-level inventory — dense, path-anchored, meant for developers reading the codebase. For a plain-language guided tour of the same features, see [`OVERVIEW.md`](./OVERVIEW.md). For the as-built rationale (decisions, alternatives ruled out, security notes), see [`HISTORY.md`](./HISTORY.md). For what's planned, see [`../ROADMAP.md`](../ROADMAP.md).

---

## Privacy policy / Terms versioning ✅ Phase A.2

RGPD Art. 7 demonstrability — records which version each user accepted and when. Bump a version string in the shared SSOT → every user is re-prompted. 7-year compliance trail in `audit_log`.

**SSOT** `@packages/policies`: `POLICY_TYPES`, `POLICY_VERSIONS`, `POLICY_CHANGELOG`. Schema: `packages/drizzle/src/schema/policies.ts` (`policy_acceptance`, append-only).

**Backend** `apps/api/src/modules/policies/` — `PolicyAcceptanceService` (N rows + N events per `uow.run` TX; `getStaleTypes` predicate). Routes: `POST /me/policies/accept`, `GET /me/policies`. `requireCurrentPolicies` middleware (`shared/middleware/policy.middleware.ts`) — 409 on stale, composable not global. Acceptance recorded at `/verify-email` hook, not `/sign-up/email` (no session there; see `HISTORY.md`).

**Frontend** `apps/app/src/features/legal/`: sign-up checkbox; public `/legal/privacy-policy` + `/legal/terms`; acceptance gate `/legal/accept` (outside `_shell`). `POLICY_URLS` — hosting on external CMS is a one-line swap.

**Event**: `user.policy.accepted` (`compliance` retention).

---

## Cookie consent + Consent management ✅ Phase A.4

CNIL/RGPD Art. 7 ePrivacy — dual-layer: server-side `consent_record` (timestamped, append-only, legally durable) linked to device via httpOnly `cc_sid` cookie. Four categories: `necessary` (always on), `functional`, `analytics`, `marketing` (default off). TTL 180 days (configurable).

**SSOT** `@packages/cookie-consent`: `CONSENT_CATEGORIES`, `CONSENT_COOKIE_NAME="cc_sid"`, `CONSENT_GRANT_TTL_DAYS=180`. **DB** `packages/drizzle/src/schema/consent.ts` — `consent_record` (append-only; most-recent wins).

**Backend** `apps/api/src/modules/consents/` — `ConsentService`: `record` / `withdraw` / `getActive` (with `subjectId` fallback) / `reconcile` (links device→account at login via `auth.ts` `hooks.after` on `newSession`, zero client round-trip). Routes: `POST /consents`, `GET /consents`, `DELETE /consents` (public, `optionalAuth`). Guest sweep: `shared/internal-routes/sweep-consents.route.ts` (HMAC-gated, `CONSENT_RETENTION_DAYS=365`).

**Frontend** `apps/app/src/shared/`: `<CookieBanner>` (Reject/Accept same prominence, auto-mounted) · `<ConsentSettings>` (per-category toggles) · `<ConsentGate category>` (declarative gate) · `useConsent(category): boolean` · `<AnalyticsScripts>` (loads `VITE_ANALYTICS_SRC` env only if `analytics` consented — template for gated scripts) · `/legal/cookies` (per-category cookie inventory).

**Events**: `user.cookie_consent.granted` + `user.cookie_consent.withdrawn` (`compliance` retention).

---

## Compliance docs bundle ✅ Phase A.3

EAA Art. 14 accessibility declaration + GDPR Art. 28 sub-processor disclosure — mandatory for EU deploys. Plus contract templates for EU client onboarding.

**Frontend** `apps/app/src/features/legal/`: `/legal/sub-processors` (typed config `SUB_PROCESSORS` in `shared/sub-processors.config.ts`) · `/legal/accessibility` (WCAG 2.1 AA / EN 301 549 statement, known limitations, feedback contacts).

**Contract templates** `docs/legal/`: `DPA-template.md` (12-clause GDPR Art. 28 DPA) · `DORA-annex-template.md` (11-provision DORA Art. 30 annex, mandatory EU fintech/insurance since Jan 2025) · `README.md` (fintech vs B2B decision table, production-readiness checklist).

---

## Profile editing + NIST 800-63B-4 password baseline ✅ Phase A.1

**Profile editing** (`features/account/account.page.tsx` — `ProfileCard`): display name (max 80 chars), email (re-verification via BetterAuth, confirmation to current address), avatar (three-step presign → PUT → confirm, client-side `image/*` + 5 MB guard, `createUploadMutationOptions`).

**Password baseline (NIST SP 800-63B-4)**: min 15 chars, no complexity rules (`shared/auth/auth.schema.ts`). HIBP breach check at sign-up / change / reset (k-anonymity SHA-1 prefix, `HIBP_TIMEOUT_MS=3000`, **fail-open**). Contextual ban-list (`shared/password-policy.ts`) — email local-part, display name, app name. All enforced via BetterAuth `hooks.before`. Port: `shared/ports/password-breach.port.ts` + `shared/services/hibp-password-breach.service.ts`.

**Field UX**: show/hide toggle + per-field hint. Server errors (breach / ban / wrong current password) render inline, not as toast.

---

## Auth — BetterAuth ✅

- **Email + password** — required verification + reset (forgot-password → token via app URL).
- **Magic link** (passwordless email).
- **Passkeys** (`@better-auth/passkey`, WebAuthn) — registered and managed from `/settings/account`.
- **Two-factor** (TOTP, backup codes) — enable / disable from `/settings/account`. Recovery codes: password-gated, `clean-stack-recovery-codes.txt` download. Backup-code fallback on `/two-factor`. On-use email via `BackupCodeUsedNotifier`.
- **Active sessions** — list & revoke from `/settings/privacy`.
- **Bearer tokens** alongside cookies — web = httpOnly cookie; Capacitor = bearer.
- **Session cache** (5 min signature-only; DB source of truth at expiry → instant revoke).
- **Cross-tab sync** via `BroadcastChannel` (`shared/auth/auth-broadcast.ts`). **Token routes** outside auth gate — StrictMode-safe `useRef` guard.
- **Layout gates** (`_protected` / `_guest`) in `apps/app/src/router.tsx` — `ensureQueryData(sessionQueryOptions)` in `beforeLoad`.

Pages: `sign-in`, `sign-up`, `verify-email`, `forgot-password`, `reset-password`, `magic-link`, `two-factor`.

---

## Multi-tenant — BetterAuth `organization` plugin ✅

Org-scoped from the very first migration.

- **Personal org** auto-created on signup (`ensurePersonalOrgFor`, self-heal in `databaseHooks`). Slug `personal-${uuid}`, never deletable, never leavable.
- **Team orgs** — slug auto-gen, email invitations, role-based members, ownership transfer.
- **Auto-cleanup** — `afterRemoveMember` deletes empty non-personal orgs.
- **Capability-based authorization** (`@packages/access-control` — single SSOT). Three layers, same predicate: server `requireOrgPermission` middleware · route gate `ensureOrgPermission` in `beforeLoad` · UI `<Can requires={…}>` + `useAuthorization().can()`.
- **Dev-only `<AuthorizationDevTool>`** — live role-by-capability matrix, tree-shaken in prod.

Pages: `/organization/new`, `/settings/general`, `/settings/team`, `/dashboard`, `/invitations`.

---

## Email — Resend + queue-based delivery ✅ Phase D.5

**DB** `packages/drizzle/src/schema/email.ts` — `email_message` table (durable outbox).

**`@packages/emails`** — in-repo React Email templates, rendered server-side at enqueue. `TEMPLATE_IDS` override: empty = in-repo template, non-empty = Resend dashboard template.

**`QueuedEmailService`** (`shared/services/email.service.ts`) — enqueues rows; `options.tx` for atomicity. Methods: `sendTemplate`, `sendTemplateBatch`, `sendRaw`, `sendRawBatch`.

**`EmailDeliveryWorker`** (`shared/services/email-delivery-worker.service.ts`) — polls every 2 s, `FOR UPDATE SKIP LOCKED`, up to 300 rows per tick, chunked 100/request, 10 req/s (Resend team limit).

**Retry** — decorrelated jitter (`shared/jitter.ts`). Ceiling → `status = 'failed'`, emits `email.delivery.exhausted`. **Idempotency** — `${idempotencyKey}/${index}` per recipient. **Retention sweep** — `POST /internal/sweep-email-messages` (HMAC-gated, `EMAIL_MESSAGE_RETENTION_DAYS=7`). `failed` rows kept as audit trace.

**DNS hardening required before prod**: SPF, DKIM (3 Resend CNAMEs), DMARC. Gmail/Yahoo/Outlook reject unauthenticated bulk senders since 2024-2025.

---

## Storage — S3-compatible (Cloudflare R2 prod / SeaweedFS dev, opt-in) ✅

Three-step flow: `presign` → client `PUT` → `confirm`. Server is blind during upload. Provider-agnostic S3 SDK (`region: "auto"`, `forcePathStyle: true`); boot-time fail-hard on localhost endpoint or default creds in prod.

- **Owner-scoped keys** — `<userId>/<scope>/<uuid>-<filename>`. Download + confirm reject keys without the requesting user's prefix.
- **Confirm mandatory** — `HeadObject` validates size/contentType, deletes on mismatch. (R2 has no presigned POST policy — hence PUT + confirm.)
- Use-cases: `create-upload-url`, `confirm-upload`, `create-download-url`. Routes: `POST /uploads/presign`, `POST /uploads/confirm`, `POST /uploads/download`.
- Dev opt-in: `docker compose --profile storage up seaweedfs seaweedfs-init -d` (host port `8333`).

Module: `apps/api/src/modules/uploads/`.

---

## RGPD / CCPA — erasure (Art. 17) + portability (Art. 20) ✅

- **Export** — `POST /me/export`, auth-gated, sync (walks user tables, uploads JSON to R2, emails a signed 7-day URL). Rate-limited 1/24h.
- **Delete** — `POST /me/delete`, 2FA-required + sole-owner preflight + **7-day soft-delete grace**. Cron `POST /internal/rgpd/process-pending-deletions` (HMAC-signed) wipes PII and anonymizes `member` rows. Preflight `GET /me/delete/preflight` lists blocking orgs; UI shows Transfer/Leave CTAs. No implicit auto-transfer.
- **Cancel UX** — sign-in during grace window prompts cancel/continue. `deletedAt` + `pendingDeletionUntil` are the only soft-delete columns in the schema.
- **Public `/legal/data-rights`** — what's deleted vs anonymized vs retained per legal basis.

Frontend cards: `DataExportCard` (→ `/settings/privacy`), `RgpdDeletionCard` + preflight list (→ `/settings/account` danger zone). Source: `features/rgpd/`.

**Events**: `user.deletion.{requested,cancelled}`, `user.deleted`, `user.export.{requested,completed}` (`compliance` retention).

---

## API — Hono on Bun ✅

- **Native `Bun.serve()`** — `bun build` prod (~7 ms cold), `bun --hot` dev.
- **Hono RPC** end-to-end types via `hcWithType` (one client instance).
- **Pipeline** (in order): `requestId` → `httpLogger` (pino) → `secureHeaders` + `cors` → `sessionMiddleware` → `auth.handler` for `/api/auth/*` → `app.onError`.
- **CQRS**: Commands → Use Cases; Queries hit Drizzle directly.
- **DI** via `inwire` — type inference, no declared interfaces, `AppDeps = typeof di`.

---

## App — Vite + React 19 + TanStack ✅

- **TanStack Router code-based** — `<name>.route.tsx` + `<name>.page.tsx` (lazy chunk). Layouts/gates in `apps/app/src/router/layouts.tsx`. Single hand-written `router.tsx` — no generated `routeTree.gen.ts`, no Vite plugin watcher. `defaultPreload: "intent"` prefetches on hover.
- **TanStack Query** — all server state. Mutations via `mutationOptions` factories.
- **Forms**: `react-hook-form` + `@hookform/resolvers/zod` + shadcn `Form`. Mandatory `defaultValues`. Schema split: same field validated loosely at capture, strictly at creation.
- **Theme**: `next-themes` + View Transitions API circle reveal with `prefers-reduced-motion` fallback.

---

## App shell — top-nav + ⌘K palette ✅

- Sticky header: org switcher, theme toggle, user menu.
- Contextual settings tabs filtered by capability (`SETTINGS_TABS` declares `requires` + `requiresOrg`).
- Command palette (⌘K) — `NAVIGATION_ROUTES` filtered by capability. `LEGAL_ROUTES` sourced from `shared/legal-routes.ts` (shared with legal footer).

---

## UI — shadcn/ui (`@packages/ui`) ✅

Full shadcn/ui registry pre-installed. `shadcn-pure` rule: use real slots, no `pt-6` / `space-y-4` patches.

- **Typography** — `TypographyH1`–`H4`, `P`, `Lead`, `Large`, `Small`, `Muted`, `InlineCode`, `Blockquote`, `List` exports. Never raw `<h1 className="text-5xl">`.
- **Custom primitives** (`@packages/ui/components/ui/`, all `asChild`-compatible): `NavLink` (plain/pill/underline + active), `BrandLink`, `TextLink`, `DestructiveActionDialog`, `ListRow`, `FormTextField` (RHF Controller + show/hide on password fields).
- **Theme tokens** in `packages/ui/src/styles/globals.css` `@theme` — `className` for layout; colors/typography/radius in theme.

---

## DDD-kit (`@packages/ddd-kit`) ✅

Primitives for business domain only (never DDD for billing / auth / gating — see root `CLAUDE.md`).

- `Result<T, E>` (no throw in domain/application), `Option<T>` (no null/undefined for absence).
- `Entity`, `Aggregate`, `ValueObject` (zod-validated `protected validate()`), `UUID`, `DomainEvent`, `BaseRepository`, `ScopedRepository`, `UseCase`, `QueryHandler`, `IUnitOfWork`.
- Events added in aggregate methods via `this.addEvent(...)`, dispatched after persistence in use cases.

---

## Database — Drizzle + Postgres 17 ✅

- Postgres on `localhost:5433` (dedicated port) via `docker compose up postgres -d`.
- Schemas: `packages/drizzle/src/schema/*.ts` — auth, multi-tenant, policies, consent, billing, webhooks, audit-log, outbox, email, quota-usage, rate-limit.
- `withOrg(table, orgId)` helper — org-scoped tables NEVER queried without it (rule enforced in sub-CLAUDE.md).
- `TransactionService` — controllers manage transactions and pass to use cases.

---

## Tooling — zero-warning pipeline ✅

- **pnpm 10** + **Turborepo** TUI. `globalDependencies` bust caches on `biome.json` / `pnpm-workspace.yaml` / `.env*`.
- **Biome** (lint + format) · **knip** (unused exports) · **jscpd** (duplication) · **Husky + commitlint** (Conventional Commits) · **lint-staged** (Biome on staged files) · **pre-push**: `pnpm ci:check`.
- **semantic-release** — `dev`→`main` merge commit: `feat`→minor, `fix`/`perf`/`refactor`/`build`→patch, `BREAKING CHANGE:`→major.
- **Testing**: `bun test` (api) + `vitest` (packages, app). BDD style, mock at port level.

---

## Observability ✅

- **`pino`** + **`hono-pino`** — JSON prod, `pino-pretty` dev. `info` prod / `debug` dev. Status-driven HTTP log level (`5xx`→`error`, `4xx`→`warn`). Every line carries `requestId`.
- **Single `app.onError(errorHandler)`** — `HTTPException` → `{ error: { code, message, requestId } }`. No per-route try/catch.
- **Sentry** (`@sentry/bun` api + `@sentry/react` app) — NoOp without `SENTRY_DSN`. Captures ≥500 errors with `requestId/userId/orgId` tags, RGPD scrubbing (drops Cookie, Authorization, email, ip_address). Source maps in CI via `@sentry/vite-plugin`.
- OTel + Prometheus `/metrics` deferred until a tracing/scrape backend exists. See [`./OBSERVABILITY.md`](./OBSERVABILITY.md).

---

## Disaster recovery ✅ (doc-only)

PITR delegated to the managed Postgres provider (Neon/Supabase/RDS/Railway). No backup code ships — providers cover sub-minute RPO.

- **`docs/DISASTER-RECOVERY.md`** — RPO/RTO targets, 3-2-1 rule applied, PITR setup per provider, restore runbook.
- **Weekly `pg_dump` export** — GitHub Actions / Railway Cron / K8s CronJob recipes. Streams `pg_dump | gzip | aws s3 cp -`, read-only Postgres role.
- **Monthly restore-test** — GitHub Actions recipe: spawn Postgres, restore, `psql count(*)` smoke check.

---

## Event-driven foundation ✅

**Zero plumbing post-clone** — declare an event in `@packages/events`, call `addEvent()` in the aggregate, run via `uow.run()`: audit log row + webhook fanout + in-process `onEvent(...)` handlers fire automatically.

- **Outbox** `outbox_event` — UUID v7 PK, partial index on pending rows, `pg_notify` trigger ensured idempotently at boot.
- **Dispatcher** — in-process Bun worker, `pg.Client` LISTEN + 30s poll fallback, `FOR UPDATE SKIP LOCKED` drain (multi-instance safe). Built-in subscribers inside the dispatch TX (atomic); `onEvent` handlers post-commit (isolated).
- **Audit log** (`audit_log`) — append-only (SOC2 / ISO 27001). `operational` (90d) vs `compliance` (7y) retention. Optional tamper-evidence hash chain (`AUDIT_TAMPER_EVIDENCE`). Operator UI at `/admin/audit-log` (filters, pagination, chain verify) — gated `requirePlatformAdmin`.
- **Outbound webhooks** — HMAC-SHA256 signed (Stripe-style), AEAD-encrypted secrets (XChaCha20-Poly1305 + HKDF per org), decorrelated jitter retry (1m/5m/30m/2h/12h), dead-letter after 5 attempts, replay. See §Outbound webhooks for the full front-end surface.
- **Catalog** `@packages/events` — **67 events** (28 public / 39 internal) with Zod payloads + `RETENTION_MAP`. BetterAuth bridge alone covers 25 events; other services add the rest.
- **Request correlation** — `X-Request-Id` threaded into `outbox_event.metadata` and `audit_log.request_id` via `AsyncLocalStorage`.

See [`./EVENTS.md`](./EVENTS.md) for the DX guide (add an event, build a handler, multi-tenant safety, BetterAuth bridge, HMAC verification).

---

## Security & hardening ✅ Phase C.1

Deploy-safe perimeter — rate-limit, strict CSP, and stateless CSRF, wired before any business feature.

**Rate-limit** (`apps/api/src/shared/middleware/rate-limit.middleware.ts`): `global` policy + 8 per-auth-route burst policies. IETF `RateLimit` / `Retry-After` headers. **Fail-closed on auth** — store outage → 503; global fail-open. `TRUSTED_PROXIES=private` (Railway/Fly) or CIDR. Store: memory (dev) → Postgres (multi-replica).

**CSP** (Caddy + Vite, not a Hono middleware): per-request nonce via Caddy `{http.request.uuid}` forwarded to Vite via `html.cspNonce`. `'strict-dynamic'` — no `'unsafe-inline'`, no host allowlist. `POST /csp-report` (IP-rate-limited, `Cross-Origin-Resource-Policy: cross-origin`).

**CSRF** (`apps/api/src/shared/middleware/csrf.middleware.ts`): origin-allowlist on unsafe methods, stateless (no token, no cookie). Allowlist = `CORS_ORIGIN`. Bearer-skip for Capacitor / PATs / HMAC internal calls.

**Hardened headers** (Caddy): HSTS (1 year, includeSubDomains), `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geo off).

**Abuse prevention**: disposable-email block (~90k static list + DNS MX, fail-open, `DISPOSABLE_EMAIL_BLOCK_ENABLED`) + HIBP-hit telemetry event (`security.password.breached` — request already rejected, this makes it observable in the audit trail).

**Prod boot guard**: api `process.exit(1)` on missing `CORS_ORIGIN` (empty allowlist = CSRF no-op).

**Events** (`operational` retention): 5 events covering rate-limit, CSP violation, CSRF rejection, disposable-email block, and HIBP breach telemetry.

---

## Billing — Stripe subscriptions + feature/seat gating ✅ Phase B.1

Per-organization subscriptions, zero billing backoffice. Stripe Checkout for upgrades, Stripe Billing Portal for management.

**State**: `subscription` table (webhook-synced) — never `organization.metadata` (untyped, diverges under out-of-order webhooks). **Hybrid catalog** (`apps/api/src/modules/billing/config.ts`): prices + copy in Stripe Products; entitlements + `maxMembers` in typed `ENTITLEMENTS` map; `metadata.tier` is the join key.

**Three gate axes** (transferable pattern for any premium feature):
- **Role**: `billing:["read","manage"]` in `@packages/access-control`.
- **Seats**: `ENTITLEMENTS[tier].maxMembers` enforced in `beforeAddMember` / `beforeAcceptInvitation` / `beforeCreateInvitation`. Unlimited = `null` (`BILLING_SEAT_LIMIT_REACHED`).
- **Tier/feature**: `requireFeature` / `requirePlan` (back, `402`); `useEntitlements()` / `<FeatureGate>` / `<PlanGate>` (front). Free tier: unlimited orgs, 3 members.

**Module** `apps/api/src/modules/billing/` — `CatalogService` (free-only when `STRIPE_SECRET_KEY` unset), `EntitlementsService`, `SubscriptionReadStore`, `StripeCatalogSourceAdapter`. Routes: `GET /billing/plans`, `GET /billing/subscription`, `POST /billing/checkout`, `POST /billing/portal`. **Frontend** `apps/app/src/features/billing/`: `/pricing` · `/settings/billing` · `useEntitlements()` · `<FeatureGate>` · `<PlanGate>`.

**Quota gating (B.2, dormant)**: `ENTITLEMENTS[tier].quotas` + `assertQuota`/`requireQuota` middleware + `quota-reservation.ts` + `quota_usage` table + `useQuota`/`<QuotaGate>`. See [`docs/QUOTA-GATING.md`](./QUOTA-GATING.md).

**Env**: `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`.

---

## Outbound webhooks front UI + public event catalog ✅ Phase C.5

Full operator surface for webhook endpoint management and delivery inspection, plus a public developer event reference.

**Back-end hardening**:
- **SSRF guard** — URL validated at create/update AND re-validated at delivery (anti-DNS-rebinding). Blocks loopback, RFC1918, link-local, CGNAT, cloud-metadata IPs. Rejects with `WEBHOOK_URL_FORBIDDEN`.
- **Dual-secret rotation** (`POST /settings/webhooks/:id/rotate-secret`) — grace window `WEBHOOK_SECRET_GRACE_HOURS` (default 24h). During grace both secrets sign; `x-webhook-signature` carries multiple `v1=` values.
- **Delivery timeline** — `webhook_delivery_attempt` table: request/response headers + bodies (capped at `WEBHOOK_RESPONSE_CAPTURE_BYTES`, default 4096), `durationMs`. Exposed via `GET /settings/webhooks/:id/deliveries/:deliveryId`.
- **Auto-disable failing endpoints** — after `WEBHOOK_AUTO_DISABLE_AFTER_DAYS` (default 5) with ≥ `WEBHOOK_AUTO_DISABLE_MIN_FAILURES` (default 2) consecutive failures. Re-enable is manual. Emits `webhook.endpoint.disabled`.
- **Wildcard subscriptions** — `"*"`, `"<group>.*"`, or exact event names. Internal events never fan out.
- **Test event** (`POST /settings/webhooks/:id/test`) — also auto-fired on endpoint creation.

**Frontend** `apps/app/src/features/webhooks/`: `/settings/webhooks` — endpoint list (enabled / paused / auto-disabled badges), create/edit Sheet with `EventTypePicker` (namespace groups + wildcards, same SSOT as the public catalog), cursor-paginated delivery list, per-delivery timeline drawer, one-shot secret reveal, rotate + test actions.

**Public event catalog** `apps/app/src/features/developers/`: `/developers/events` (no auth) — all public events (28 since the C.4 visibility allowlist) with group, retention, expandable Zod JSON schema, Node.js signature-verification snippet.

---

## Privacy dashboard ✅ Phase A.5

UX hub consolidating privacy, compliance, and session surfaces into `/settings/privacy`. Zero back-end changes, zero migrations, zero new events.

**Source** `apps/app/src/features/privacy/`. Page composition: `<PolicyAcceptanceCard>` + `<ConsentSettings>` + `<DataSourcesCard>` (`shared/sub-processors.config.ts`) + `<DataExportCard>` + `<SessionsCard>`.

**Relocations**: `DataExportCard` + `SessionsCard` moved from `account.page.tsx`; `RgpdDeletionCard` stays on `account.page.tsx` (danger zone); `features/danger/` deleted (merged into `features/organization/components/`).

---

## Admin & impersonation ✅ Phase C.3

Platform operator tooling — ban/unban users, change platform role, force password reset, revoke sessions, impersonate with justification. Every action emits a compliance-retained `admin.*` event.

**Backend** `apps/api/src/modules/admin/`:
- `AdminQueryService` — read-only platform user and org queries.
- `AdminActionService` — ban, unban, role-change, force-password-reset, revoke-sessions. Instantiated in `routes.ts` (not inwire — real import cycle; deps from `di`).
- `DrizzleAdminUserStore` / `DrizzleAdminOrgStore` — org-scoped reads with pagination and search.
- `admin-impersonation.routes.ts` — `POST /admin/impersonation/:id/start` (reason required, ticketRef optional) + `POST /admin/impersonation/stop`.
- `relay-set-cookie.ts` — proxies BetterAuth `Set-Cookie` headers to the app client.
- `shared/middleware/impersonation-blocklist.ts` — BetterAuth `beforeHook` blocking BetterAuth-owned auth paths: password/email change, MFA, passkey, social account link/unlink (`/link-social`, `/unlink-account`), session revocations (`/revoke-session`, `/revoke-sessions`, `/revoke-other-sessions`), and the `/admin` prefix.
- `shared/middleware/deny-impersonated.middleware.ts` — per-mutation Hono middleware blocking 11 custom routes (RGPD export/delete, all webhook mutations, billing portal, and `POST /me/policies/accept` — an admin must not countersign legal terms on behalf of the user); returns 403 `IMPERSONATION_ACTION_FORBIDDEN`.

**Frontend** (all UI copy in English):
- `features/admin-users/` — `admin-users.{route,page}.tsx`, `admin-user-detail.{route,page}.tsx`, `api/admin-users.{queries,mutations}.ts`, `forms/impersonate-form.tsx`, `admin-users.schema.ts`. "Admin" nav entry links to `/admin/users`.
- `features/admin-orgs/` — `admin-orgs.{route,page}.tsx`, `admin-org-detail.{route,page}.tsx`, `api/admin-orgs.queries.ts`.
- `shared/components/impersonation-banner.tsx` — non-dismissable, live countdown, mounts in `_shell`.
- `shared/auth/is-impersonating.ts` — derives impersonation state from the session payload.
- `shared/auth/can-access-platform-admin.ts` — combines `isPlatformAdmin` (role) with `twoFactorEnabled` (MFA); gates the "Admin" nav entry in `app-shell.tsx` and `ensure-platform-admin.ts`; a platform admin without 2FA active is redirected to `/settings/account`.
- `router/should-redirect-to-legal-accept.ts` — returns `false` when `isImpersonating(session)` is true, so the legal acceptance gate does not trap the admin on a page whose only exit is to consent.
- `shared/api/mutations/stop-impersonation.ts` — mutation factory used by the banner.

**Transparency email**: `application/event-handlers/notify-impersonated-user.ts` — `onEvent(ADMIN_IMPERSONATION_STARTED)` handler, tolerant (failure captured, does not abort).

**Events** (7 new, all `compliance` retention): `admin.impersonation.{started,stopped}`, `admin.user.{banned,unbanned,role_changed,password_reset,sessions_revoked}` → catalog 55 → **62 total**.

---

## Personal Access Tokens (API tokens) ✅ Phase C.4

Machine-to-machine access with scoped, expirable tokens. Tokens are shown once at creation and never stored in plaintext.

**Format**: `clean_` prefix (configurable via `API_TOKEN_PREFIX`) + 44 base58 body characters + 6-character CRC32 checksum. The checksum rejects malformed tokens before any database call. `apps/api/src/shared/crypto/api-token.ts` — `generateToken`, `parseToken`, `hmacToken`.

**Storage**: `HMAC-SHA256(pepper, raw_token)` in a unique-indexed column (`api_token.tokenHmac`). The pepper (`API_TOKEN_PEPPER`) is a server-side secret: a database dump alone yields no usable tokens. `pepperVersion` column enables rotation without downtime via `API_TOKEN_PEPPER_PREVIOUS` — tokens found by the old pepper are transparently rehashed on next use.

**Schema** `packages/drizzle/src/schema/api-token.ts` — `api_token(id, userId FK, organizationId FK nullable, name, tokenHmac unique, pepperVersion, tokenStart, scopes jsonb, lastUsedAt, expiresAt, revokedAt, revokedReason, createdAt, updatedAt)`.

**Backend** `apps/api/src/modules/api-token/`:
- `ApiTokenService` — `create`, `list`, `revoke`. One write per token (no per-request DB write: `lastUsedAt` updated via bucket: `WHERE last_used_at < now() - interval '15 min'`).
- `DrizzleApiTokenRepository` implements `ScopedRepository<ApiToken, RepoScope>` (wrong-owner → `Option.none()` / `NOT_FOUND`, never 403).
- `revokeTokensOnMembershipLost` event handler — cascades revocation on `org.member.removed`.
- Routes `apps/api/src/modules/api-token/routes.ts` — `GET/POST /settings/tokens`, `DELETE /settings/tokens/:id` (session-auth; `denyImpersonated` on writes).
- Scanning route `apps/api/src/modules/api-token/scanning.routes.ts` — `POST /api/token-scanning/github` (ECDSA P-256 signature verification against GitHub's live public-key endpoint; revokes + emails owner on match).

**Public API sub-app** `apps/api/src/public-api/` — a separate `Hono` instance mounted at `/api/v1`, outside `AppType`. `sessionMiddleware` skips `/api/v1/*` entirely; the sub-app mounts `requireApiToken` on all routes. Token-reachable routes: `GET /api/v1/me`, `GET /api/v1/organizations`. **Why a separate sub-app rather than a flag on existing routes**: any route that mounts both `requireAuth` and `requireApiToken` eventually drifts — a new route gets one but not the other. The sub-app makes the contract structural: what is in `/api/v1` is reachable by token, everything else is session-only. The global rate-limit policy is also bypassed at `/api/v1/*` and replaced with per-token + per-IP axes.

**Middleware** `apps/api/src/shared/middleware/api-token.middleware.ts` — `requireApiToken(deps, { scopes })`. Validates checksum, resolves HMAC (with previous-pepper fallback + transparent rehash), checks expiry, checks ban, sets `c.var.{user, tokenScopes, orgId, apiTokenId}`.

**Scopes** `API_SCOPES = ["read:profile", "write:profile", "read:organizations"]` — typed const. Per-token subset; no wildcard `*`. Anti-escalation is structural: token management lives outside `/api/v1`, so a token can never mint a token.

**Access-control** `@packages/access-control` — `apiToken: ["create", "read", "revoke"]` in the org capability statement.

**Frontend** `apps/app/src/features/api-tokens/`:
- `api-tokens.{route,page}.tsx` — `/settings/tokens` (within Settings tabs).
- `forms/token-form.tsx` — name + scope checkboxes + optional expiry. Created token shown once via `<SecretRevealDialog>`.
- `api/api-tokens.{queries,mutations}.ts` — list + create + revoke.

**Event visibility** `packages/events/src/visibility-map.ts` — 67-event catalog with explicit `public` / `internal` classification (28 public / 39 internal). Three consumers: `WebhookFanoutSubscriber` (only fans out public events), `/developers/events` catalog page (only lists public events), and webhook subscription picker (only offers public events).

**Events** (3, `operational` retention): `api_token.created` (public), `api_token.revoked` (public), `api_token.used` (internal, sampled via bucket) → **67 total / 28 public / 39 internal**.

**Email** `packages/emails/src/components/api-token-leaked.tsx` — template sent to the token owner when GitHub Secret Scanning reports a match.

**Env** `apps/api/.env.example`: `API_TOKEN_PEPPER` (required prod, min 32 chars), `API_TOKEN_PEPPER_PREVIOUS` (rotation), `API_TOKEN_PEPPER_VERSION` (default 1), `API_TOKEN_PREFIX` (default `clean_`), `API_TOKEN_MAX_EXPIRY_DAYS` (default 365), `API_TOKEN_LAST_USED_BUCKET_MIN` (default 15).

---

## In-app notification center ✅ Phase D.3

Persistent inbox behind a bell, real-time over SSE, three-level preferences. No new event type: D.3 *consumes* the catalog.

**Catalog projection** `packages/events/src/notification-map.ts` — third projection after `visibility-map` (webhooks) and `retention-map` (purge). 21 of the 67 events are notifiable; an absent event produces nothing. Each entry declares `audience`, `category`, and optionally `forced` / `groupBy` / `dedupWindow`. `forcedLevelOf(category)` reports whether a category is `all` / `some` / `none` forced — `security` is fully forced, `billing` only partly, which a per-category boolean could not express.

**Audience by capability, never by role tuple**: `"self" | "actor" | "org:all" | { can: OrgPermissions }`. `ORG_ROLES.filter(authorizeRole)` resolves at boot, leaving `WHERE member.role = ANY($1)`.

**Schema** `packages/drizzle/src/schema/notification.ts` — `notification(id, userId FK, organizationId FK nullable, category, eventType, groupKey, dedupKey, payload jsonb, readAt, emailPendingAt, emailSentAt, createdAt)` + `notification_preference(scope 'user'|'org', scopeId, category, channel, enabled, frequency, locked)`. Five indexes, three partial: unread count, email-pending, and the dedup unique index `(userId, dedupKey) WHERE dedup_key IS NOT NULL`. **`organizationId` nullable is a documented exception to org-scoping rule #3** — `user.password_changed` belongs to no org.

**Fan-out** `apps/api/src/shared/services/notification-fanout-subscriber.ts` — an `OutboxSubscriber` running inside the dispatch TX beside audit and webhook fan-out, not an `onEvent` post-commit handler (which is best-effort, so a lost notification would fail silently). One `INSERT ... SELECT` over the recipient set, never N inserts in a loop. The recipient set is either a single user or `SELECT user_id FROM member WHERE ...`; everything downstream is shared.

**Preference cascade, applied in that same statement** via one `LEFT JOIN notification_preference` per scope per channel:

```
org row with locked=true  >  user row  >  org row (unlocked default)  >  enabled
```

`forced: true` short-circuits all four and emits no joins at all. The in-app decision is the `WHERE`; the email decision is a `CASE` filling `emailPendingAt`, so a user who keeps in-app but drops email simply gets a row with no pending mail. **Verified against Postgres via `pnpm --filter api check:fanout`** (`apps/api/scripts/check-fanout-preferences.ts`, 8 cases): a mocked transaction evaluates no `WHERE`, so unit tests structurally cannot cover this, and the repo has no DB integration harness. Re-run it after touching the fan-out.

**Real-time** `apps/api/src/shared/services/notification-stream-hub.ts` + `GET /notifications/stream` — Postgres trigger `pg_notify('notification_created', user_id)`, one `LISTEN` connection per instance (never per client), `streamSSE` with a 25 s heartbeat, capped at `MAX_STREAMS_PER_USER`. **The stream carries a signal, never data**: the client's only reaction is `invalidateQueries(["notifications"])`, which makes reconnection self-healing and removes `Last-Event-ID`, replay, and merge logic entirely.

**Routes** `apps/api/src/modules/notifications/routes.ts` — `GET /notifications`, `GET /unread-count`, `POST /read`, `POST /read-all`, `GET|PUT /preferences`, `GET|PUT /org-preferences` (the org pair gated by `requireOrgPermission({ organization: ["update"] })`), `GET /stream`. Writes carry `denyImpersonated`.

**Crons** on the `/internal/*` rail: `flush-notification-emails` (1 min, batch capped at 5000) and `sweep-notifications` (**read rows only** — an unread notification outlives retention).

**Frontend** — everything cross-cutting is in `apps/app/src/shared/notifications/`, because `shared/` may not import `features/` (the bell mounts in `app-shell`) and the preference matrix has two route-owning consumers that may not import each other:
- `notification-bell.tsx` / `notification-item.tsx` — bell, badge, dropdown inbox. Row labels reuse `EVENT_DESCRIPTIONS`; grouped rows read "and N more".
- `use-notification-stream.ts` — `fetch` + `ReadableStream`, **not `EventSource`** (which cannot carry an `Authorization` header, breaking any bearer-authenticated client). Exponential backoff with jitter, `AbortController` on unmount. `handleStreamChunk` is pure and returns its trailing partial frame, because a stream splits SSE frames wherever it likes.
- `notification-broadcast.ts` — mark-as-read propagates cross-tab over `createBroadcastChannel` and applies to the cache without refetching.
- `preference-matrix.tsx` / `build-preference-matrix.ts` — the grid is rebuilt for all four categories from the explicitly-stored rows alone; an absent cell renders as enabled/immediate, which is what the fan-out applies. A fully-forced category renders disabled **with its reason**, never hidden.
- Polling is a fallback only: `refetchInterval: connected ? false : 30_000` plus `refetchIntervalInBackground: false`, so a forgotten tab whose stream died stops polling.

`apps/app/src/features/notifications/` keeps only `/settings/notifications` (route + page); the org defaults card lives in `features/organization/components/org-notification-defaults-card.tsx` behind `<Can requires={{ organization: ["update"] }}>` — a route under `orgScopeLayout` would collide, since it flattens children under `settings/`.

**Events**: none added. Notification creation deliberately emits nothing (it would loop with its own subscriber). Preference *mutations* do emit `notification.preference.updated` / `notification.org_preference.updated` — they are persistent state changes. Catalog stays **67 / 28 public / 39 internal**.

**Dev seed** `apps/api/scripts/seed-dev-user.ts` (`pnpm --filter api db:seed`) — creates a verified account through `auth.api.signUpEmail`, so it crosses the real sign-up hooks. `SEED_EMAIL` must use a domain with a real MX record (default `dev@example.com`); the disposable-email guard rejects `.test`. `SEED_PASSWORD` must contain neither the email local part, the user name, nor the app name — `shared/password-policy.ts` rejects all three. The script records the initial policy acceptance itself: verifying the email in SQL bypasses the `/verify-email` hook that normally does it, and without it every sign-in lands on `/legal/accept`.

---

## Enterprise SSO (OIDC + SAML) + SCIM provisioning ✅ Phase C.7

`@better-auth/sso` (OIDC + SAML 2.0) and `@better-auth/scim` (SCIM 2.0, RFC 7644) enabled in `apps/api/src/auth.ts`. Gated behind the `business`-tier `sso` feature entitlement (`assertSsoEntitlementFor` in `hooks.before`, on `/sso/register` **and** `/scim/generate-token` — both unlock the same paid capability, so both refuse the same way — keyed off `body.organizationId` — no dedicated `sso: [...]` access-control statement exists; the existing `organization:["update"]` permission covers `/settings/sso` instead).

**Backend** `apps/api/src/auth.ts` + `apps/api/src/shared/auth/{sso-paths,sso-enforcement,saml-config,request-snapshots}.ts` + `apps/api/src/auth-queries.ts`:
- Per-org OIDC/SAML provider registration (`/sso/register`, `/sso/update-provider`, `/sso/delete-provider`), domain ownership verification (DNS TXT), SCIM bearer-token generation scoped per provider (`providerOwnership: { enabled: true }`, distinct namespace from SSO `providerId`s — a collision is rejected).
- **JIT provisioning**: first SSO sign-in creates the `member` row directly (`organizationProvisioning.defaultRole: "member"`) — no invitation step.
- **Domain-based enforcement**: an org can force SSO-only sign-in for its verified domain (`isSsoEnforcedFor` predicate, `apps/api/src/shared/auth/sso-enforcement.ts`) via `POST /settings/organization/sso-enforcement` (`organization:["update"]`, platform admins can also flip it per D3's ruling). Enforcement rejects `/sign-in/email`, `/sign-up/email`, `/sign-in/magic-link` (checked in `hooks.before`, before the rate-limit branch) **and** the passkey path (checked in `databaseHooks.session.create.before`, since passkey sign-in carries no email for the path-based check) with `403 { message: "SSO_REQUIRED", providerId }`. The session-hook leg discriminates on the **request** — BetterAuth hands that hook the endpoint context, and only the four SSO callback paths (plus admin impersonation) are exempt. It deliberately does not ask whether the *user* has an SSO account: once someone has signed in through the IdP they own one forever, so a user-linkage test would wave their later passkey sign-ins through and defeat deprovisioning.
- **SCIM seat cap and membership events**: the plugin writes the `member` row with a raw adapter call, so no organization hook fires on create — `POST /scim/v2/Users` is capped against the plan in `hooks.before` (402 once `maxMembers` is reached) and emits `org.member.joined` from the after-hook, with the provisioned user as subject and the connection owner as actor. Removal already reaches `afterRemoveMember`; only its actor is corrected (the plugin passes the removed user).
- **SCIM `Users` CRUD** at `/scim/v2/Users` — `POST`/`GET`/`PUT`/`PATCH`/`DELETE`, bearer-token authenticated (`base64(token:providerId[:organizationId])`, no session). `DELETE` is an **org departure, not an account deletion**: it removes only the `member` row for the owning org — the global `user` row (and any other org membership) survives untouched, and it does not route through the RGPD grace-period wipe.
- **SCIM bearer tokens are verified inside `hooks.before`, not just by the endpoint** — `runBeforeHooks` executes ahead of an endpoint's own bearer auth, so any before-branch resolving the connection owner from the `Authorization` header uses `verifiedScimConnectionOwner` (`auth-queries.ts`), which hashes the decoded token the way the `storeSCIMToken: "hashed"` mount does (SHA-256 → unpadded base64url) and constant-time-compares it. `scimConnectionOwner` alone trusts a *claimed* provider id and must never gate anything.
- **SAML is hardened on every write path** — `normalizeSamlConfig` (`shared/auth/saml-config.ts`) forces `signatureAlgorithm: "sha256"` and `wantAssertionsSigned: true` and rejects the whole `sha1`/`md5` family, on `/sso/register` **and** `/sso/update-provider`; it is spread-based so a partial update can neither weaken the security fields nor clobber identity fields it didn't send.
- **Before→after handoffs go through `RequestSnapshots<T>`** (`shared/auth/request-snapshots.ts`), never a bare `Map`: a freshness TTL bounds how long a stranded entry stays pickable and an `accepts()` predicate lets the consumer's own identity (the organization id) confirm ownership. A `hooks.before` write whose `hooks.after` never fires — a 404ing SCIM `DELETE`, for one — would otherwise poison an unrelated later request and forge its audit actor.
- **Rate limiting**: `/api/auth/scim/*` carries `SCIM_POLICY` (60/min + 1000/h, fail-closed, security events on); `/api/auth/send-verification-email` carries the same fail-closed 3/15min policy as its public "email a stranger" siblings.
- 13 events (`sso.provider.{registered,updated,deleted}`, `sso.domain.verified`, `sso.enforcement.changed`, `sso.login.{success,failure}`, `scim.connection.{created,deleted}`, `scim.user.{created,updated,deactivated,deprovisioned}`) — full source list in [`docs/EVENTS.md`](EVENTS.md#via-authts-hooksafter-phase-c7--better-authsso--better-authscim). Catalog now **80 / 34 public / 46 internal**.

**Frontend** `apps/app/src/features/sso/` — `/settings/sso` page: provider registration forms (OIDC + SAML, `forms/{oidc,saml}-provider-form.tsx`), `<DomainVerificationCard>`, `<ScimConnectionCard>`, `<SsoEnforcementCard>`. `apps/app/src/shared/auth/auth-client.ts` adds `ssoClient({ domainVerification: { enabled: true } })` + `scimClient()`.

**Sign-in entry** `apps/app/src/features/auth/sign-in.page.tsx` — a collapsible "Sign in with SSO" control (email → `authClient.signIn.sso({ email, callbackURL })`, which better-auth's redirect fetch-plugin turns into a full-page redirect to the IdP). `useSignIn` (`hooks/use-sign-in.ts`) redirects straight into the SSO flow — using the `providerId` the `SSO_REQUIRED` rejection already carries, no re-derivation from the email — instead of showing an error when a password sign-in hits an SSO-enforced org: the user did nothing wrong, their organization changed the rules.

**Local IdP for development**: Keycloak under the opt-in `sso` Docker profile (`docker compose --profile sso up keycloak -d`) — never runs on a bare `docker compose up`. Setup, the OIDC/SAML client gotchas, and the smoke-test commands are in [`docs/SSO-LOCAL.md`](SSO-LOCAL.md).

---

## Accessibility gate (A.6)

`apps/app/a11y/` — Playwright as an axe driver, not an E2E suite. Run by `.github/workflows/ci.yml` on every PR into `dev`/`main`, and locally with `pnpm --filter app check:a11y`. Details and local setup in [`apps/app/a11y/README.md`](../apps/app/a11y/README.md).

- `pages.ts` — 4 public + 3 authenticated pages, each audited in light **and** dark (18 tests). Adding a page is one array entry.
- `a11y.spec.ts` — zero `serious`/`critical` WCAG 2.1 A/AA violations, exactly one `<main>` and one `<h1>`, and an assertion on the **final URL**: a gate redirect (no session, stale policies) renders a page that passes every other check, so without it the suite audits the redirect target and reports green. Dark is a `colorScheme` loop over the same page lists — `next-themes` defaults to `system`, so emulating the preference is all it takes, and it caught a contrast failure light never shows.
- `interaction.spec.ts` — tab order across every `/sign-in` control, command-palette focus trap (10 Tab presses, released on Escape), and `prefers-reduced-motion: reduce` skipping the theme view transition (watched with a `MutationObserver`, since `theme-transitioning` is removed once the transition ends).
- `auth.setup.ts` — signs in **with the keyboard** and stores `storageState`. One sign-in per run is a hard budget: `/sign-in` allows 5 per 15 min per IP and the block is held in the API process, so a second one would lock a developer out after three local runs.
- Lighthouse is deliberately absent — its a11y category runs a subset of axe.

---

## Roadmap (not yet shipped)

See [`../ROADMAP.md`](../ROADMAP.md) — the list is short by design; anything not on it was cut rather than deferred.

- Manual review pass over the shipped surface.
- E.1 — i18n (TanStack Router locale routes + typed message catalogs).
- C.1 S5b/S6 — abuse signals + captcha hook, pending real traffic to calibrate.
- D.5 known debts — `failed` rows never purged, per-row `markSent`, lost idempotency key on `delete_completed`.
