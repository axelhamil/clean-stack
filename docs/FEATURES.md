# Features

Inventory of what ships in `clean-stack`. Everything below is wired, tested, and used in the codebase — clone, configure env, ship business logic.

For the as-built rationale (decisions, alternatives ruled out, security notes), see [`HISTORY.md`](./HISTORY.md). For what's planned, see [`../ROADMAP.md`](../ROADMAP.md).

---

## Privacy policy / Terms versioning ✅ Phase A.2

RGPD Art. 7 demonstrability — records which version each user accepted and when. Foundation for A.4 (consent stamps the policy version) and A.5 (privacy dashboard shows acceptance history).

**Shared SSOT** (`@packages/policies`): `POLICY_TYPES`, `POLICY_VERSIONS` (both currently `"2026-01-15"`), `POLICY_CHANGELOG`. Source-only package imported by api, app, and `@packages/drizzle`. Bump a version string here → all users re-prompted automatically.

**DB** (`packages/drizzle/src/schema/policies.ts`): append-only `policy_acceptance` table — `userId, policyType, policyVersion, ipAddress, acceptedAt`. Index on `(userId, policyType, acceptedAt DESC)` for fast gate lookups. Durable 7-year trail lives in `audit_log` via the compliance event.

**Backend module** (`apps/api/src/modules/policies/`): compliance infra, not DDD.
- `PolicyAcceptanceService` — `accept` writes N rows + emits N `user.policy.accepted` events in one `uow.run` TX. `getStaleTypes` is the gate predicate.
- Routes: `POST /me/policies/accept` (body `{ types?: PolicyType[] }` — omit to accept all stale), `GET /me/policies`.
- `requireCurrentPolicies` middleware (`shared/middleware/policy.middleware.ts`) — returns 409 when any policy is stale. **Composable, not mounted globally** — the `_shell` redirect is the live enforcement; this is opt-in defense-in-depth for future business routes.

**Sign-up acceptance**: recorded server-side at the BetterAuth `/verify-email` after-hook (idempotent via `getStaleTypes`), not at `/sign-up/email`. Reason: `/sign-up/email` has no session yet and returns a synthetic user on duplicate-email; `/verify-email` has a reliable session `userId`. See [`HISTORY.md`](./HISTORY.md) for the full deviation note.

**Frontend** (`apps/app/src/features/legal/`):
- Sign-up `acceptedPolicies` checkbox (`z.boolean().refine`) linking to the policies via `<PolicyLink>` (new tab, so a misclick doesn't wipe the form).
- Public `/legal/privacy-policy` + `/legal/terms` pages — placeholder content keyed by version, `PolicyDocView` component, `policies.config.tsx` + `getChangesSince` helper.
- Acceptance gate `/legal/accept` (under `_protected`, outside `_shell`) — adapts: first-time user (magic-link/social, no checkbox shown) sees a "Before you get started" welcome; a returning user with a stale version sees the changelog diff. One Accept button. `_shell` `beforeLoad` redirects here when any policy is stale (fail-open if the policies endpoint errors).
- **Hosting-agnostic content**: the full policy text ships in-app as placeholder, but every link resolves `POLICY_URLS` from `@packages/policies`. Hosting the real policies on a marketing site/CMS is a **one-line swap** there (point the URL external, delete the in-app pages) — the versioning + acceptance machinery is untouched.

**Event**: `user.policy.accepted` — self-actor, `compliance` retention.

---

## Profile editing + NIST 800-63B-4 password baseline ✅ Phase A.1

GDPR Art. 16 rectification surface + SOTA-2026 password policy, both wired into the existing `/settings/account` page.

**Profile editing** (`features/account/account.page.tsx` — `ProfileCard`):
- Edit display name (max 80 chars) + email (re-verification via BetterAuth `user.changeEmail`, confirmation sent to the **current** address) + avatar (three-step presign→PUT→confirm via `createUploadMutationOptions`, with client-side `image/*` + 5 MB guard).
- Pending email change badge visible until the new address is verified.
- `ChangePasswordCard` — standalone card for password update, below the profile fields. Passkeys/2FA/Sessions/DataExport cards remain unchanged.

**Password baseline (NIST SP 800-63B-4)**:
- **Min 15 chars** everywhere (`emailAndPassword.minPasswordLength: 15`). No MFA exception — 15 is universal.
- **No complexity rules** — `strongPasswordSchema` (`shared/auth/auth.schema.ts`) is `min(15).max(128)` only; uppercase/digit/symbol regexes removed. Applied to sign-up + password-reset flows.
- **HIBP breach screening** at sign-up / password-change / reset — k-anonymity SHA-1 prefix (`api.pwnedpasswords.com/range/<sha1[:5]>`, `Add-Padding` header). Port `IPasswordBreachService` + `HibpPasswordBreachService` (`shared/services/`). Timeout configurable via `HIBP_TIMEOUT_MS` (default 3000 ms). **Fail-open** — HIBP outage never blocks auth.
- **Contextual ban-list** (`shared/password-policy.ts`, `findPasswordViolation()`) — bans email local-part, display name, and app name. Zero I/O, pure-compute. Common passwords are left to HIBP (no redundant inline list). The full policy is wrapped in a testable `validatePassword()` (length-guard → ban-list → HIBP); the BetterAuth `hooks.before` is a one-line caller.
- **Field UX (NIST-aligned)** — `FormTextField` ships a show/hide reveal toggle + a per-field hint on every new-password input (sign-up / reset / change). Server policy errors (breach / ban / wrong current password) render inline on the field, not as a toast.
- Validation via `auth.ts` `hooks.before` on `/sign-up/email`, `/reset-password`, `/change-password` (returns `APIError` 422).

## Auth — BetterAuth ✅

End-to-end authentication on Bun + Hono, no hacks.

- **Email + password** with required verification + password reset (forgot-password flow → token via app URL).
- **Magic link** (passwordless email).
- **Passkeys** (`@better-auth/passkey`, WebAuthn) — registered & managed from `/settings/account` (`passkeys-card`, `add-passkey-form`).
- **Two-factor** (TOTP, backup codes) — enable / disable from `/settings/account` (`two-factor-card`, `enable-two-factor-form`, `disable-two-factor-form`).
- **Active sessions** — list & revoke from `/settings/account` (`sessions-card`).
- **Bearer tokens** alongside cookies — web stays cookie-based (httpOnly, XSS-safe), Capacitor uses bearer.
- **Session cookie cache** (5 min signature-only check; DB is source of truth at expiry → instant revoke).
- **Cross-tab sync** via `BroadcastChannel` (`shared/auth/auth-broadcast.ts`) — sign-in / sign-out / verify / 2FA / org change refetch live in every tab.
- **Token-consuming routes** outside the auth gate (`/verify-email`, `/reset-password`, `/magic-link`, `/two-factor`, `/accept-invitation/$invitationId`) with StrictMode-safe `useRef` guard against single-use token re-fire.
- **Layout route gates** (`_protected` / `_guest`) inline in `apps/app/src/router.tsx` — auth state read once via `ensureQueryData(sessionQueryOptions)` in `beforeLoad`.

Pages shipped: `sign-in`, `sign-up`, `verify-email`, `forgot-password`, `reset-password`, `magic-link`, `two-factor`.

## Multi-tenant — BetterAuth `organization` plugin ✅

Org-scoped from the very first migration. Migrating single-user → multi-tenant later is hell; the reverse is free.

- **Personal org** auto-created on signup (`ensurePersonalOrgFor` self-heal in `databaseHooks.user.create.after` and `session.create.before`). Slug pattern `personal-${uuid}`, never deletable, never leavable.
- **Team orgs** with slug auto-gen, invitations (email-based with `@better-auth/organization`), role-based members, transfer ownership, leave.
- **Auto-cleanup** — `afterRemoveMember` deletes empty non-Personal orgs; `beforeDeleteOrganization` rejects Personal deletion.
- **Pages shipped**: `/organization/new`, `/settings/general` (rename + leave/delete danger zone), `/settings/team` (members + invitations + role updates), `/dashboard` (org-scoped landing), `/invitations` (incoming list).
- **Mutations shipped**: `create-org`, `update-org`, `delete-org`, `leave-org`, `transfer-and-leave`, `set-active-org`, `invite-member`, `accept-invitation`, `cancel-invitation`, `remove-member`, `update-member-role`.
- **Capability-based authorization** — `@packages/access-control` is the single source of truth (`ac`, `roles`, `OrgRole` / `OrgPermissions`, `authorizeRole`). Three layers, same predicate:
  - Server: `requireOrgPermission({ resource: ["action"] })` middleware.
  - Route gate: `ensureOrgPermission(perms)` in `beforeLoad`.
  - UI: `<Can requires={...} fallback={...}>` + `useAuthorization().can()`.
- **Owner transfer** — `transferAndLeaveMutationOptions` for last-owner-leaves flow.
- **Dev-only `<AuthorizationDevTool>`** — live capability matrix per role (mounted by the app shell, tree-shaken in prod).
- **`NO_ACTIVE_ORGANIZATION` → `null`** at the query layer (transient state, not error).

## Email — Resend ✅

Dashboard-managed templates with retry + idempotency. Provider-side suppression guards IP reputation (hard bounces & complaints auto-blocked).

- **Typed templates** (`EmailTemplates` type, `TemplateVariables` per template).
- **Idempotency keys** per (template, token) — token reuse never re-sends.
- **DNS hardening required** before production: SPF, DKIM (3 CNAMEs from Resend), DMARC. Gmail/Yahoo/Outlook reject unauthenticated bulk senders since 2024-2025. See `README.md` for records.
- **Boundary-only**: `EmailService` adapter implements `IEmailService` port; failure logs at `warn` if transport not configured (dev), `throw` only on hard provider failure.

## Storage — S3-compatible (Cloudflare R2 prod / SeaweedFS dev, opt-in) ✅

Server is blind during the upload — three-step flow `presign` → `PUT` direct to provider → `confirm`.

- **Provider-agnostic** S3 SDK config (`region: "auto"`, `forcePathStyle: true`). Boot-time fail-hard on localhost endpoint or default creds in production.
- **Owner-scoped keys** — `<userId>/<scope>/<uuid>-<filename>`. Download + confirm reject keys without `<requestingUserId>/` prefix (`STORAGE_FORBIDDEN`).
- **Confirm mandatory** — server `HeadObject` validates size/contentType, deletes on mismatch, returns server-verified `{ key, size, contentType, publicUrl }`.
- **Validation at controller** (`modules/uploads/application/dto/*.dto.ts`): filename regex, scope regex, size cap, max TTL.
- **Multi-step factory** — `createUploadMutationOptions` resolves only after `confirm` succeeds; UI never sees "maybe uploaded" intermediate state.
- **Why three steps**: providers like R2 don't support Presigned POST policies (no `content-length-range`, verified 2026). PUT presigned + `confirm` is the correct shape.
- **Use-cases shipped**: `create-upload-url`, `confirm-upload`, `create-download-url`. Routes: `POST /uploads/presign`, `POST /uploads/confirm`, `POST /uploads/download`.

## RGPD / CCPA — erasure (Art. 17) + portability (Art. 20) ✅

Deletion + export cascade built before Billing/Audit so every future feature inherits the contract. A clone deployed to EU users is compliant day one.

- **Export** — `POST /me/export`, auth-gated, sync (walks the user's tables, uploads JSON to R2, emails a signed 7-day URL via Resend). Rate-limited 1/24h per user.
- **Delete** — `POST /me/delete`, 2FA-required + server-side sole-owner preflight re-check + **7-day soft-delete grace**. Cron `/internal/rgpd/process-pending-deletions` (HMAC-signed) wipes personal data (email, name, sessions, passkeys, MFA, R2 avatars) and **anonymizes** `member` rows (`userId → null`, tombstone email) so org audit trails stay intact.
- **Pre-flight gate** — `GET /me/delete/preflight` lists sole-owner non-personal orgs blocking deletion; UI shows per-row Transfer/Leave CTAs, Delete button disabled until cleared. No implicit auto-transfer (consent).
- **Cancel UX** — sign-in during the grace window prompts cancel/continue; clears `pendingDeletionUntil`.
- **Soft-delete confined to RGPD** — `deletedAt` + `pendingDeletionUntil` are the only soft-delete columns; everything else hard-deletes.
- **Public `/legal/data-rights`** — lists what's deleted vs anonymized vs retained per legal basis.
- **Events** — `user.deletion.{requested,cancelled}`, `user.deleted`, `user.export.{requested,completed}` → `compliance` audit trail.

Frontend cards (`features/rgpd/`): `DataExportCard`, `RgpdDeletionCard` (+ preflight blocking list), cancel dialog. See [`HISTORY.md`](./HISTORY.md) for decisions.

## API — Hono on Bun ✅

- **Native `Bun.serve()`** (no `@hono/node-server`) — `bun build` for prod (~7 ms cold), `bun --hot` for dev.
- **Hono RPC** end-to-end types via `hcWithType` (one client instance, `tsc` resolves once). Custom fetch slot for `X-Request-Id`, future 401 handler / token refresh / Capacitor Bearer.
- **Pipeline** (in order): `requestId` → `httpLogger` (pino) → `secureHeaders` + `cors` → `sessionMiddleware` (one `auth.api.getSession()` per request) → `auth.handler` for `/api/auth/*` → `app.onError` (single error envelope).
- **CQRS**: Commands route through Use Cases; Queries hit Drizzle directly (no use case ceremony).
- **DI** via `inwire` — type inference, no declared interfaces, `AppDeps = typeof di`.
- **Logging**: `pino` (JSON in prod, `pino-pretty` in dev), every line carries `requestId`, status-driven log level.

## App — Vite + React 19 + TanStack ✅

- **TanStack Router code-based** — features own their routes via `<name>.route.tsx` (route definition) + `<name>.page.tsx` (page component, code-split chunk via `lazyRouteComponent`). Layouts/gates exported from `apps/app/src/router/layouts.tsx`. Routes assembled in a single hand-written `apps/app/src/router.tsx`. No `routes/` folder, no `routeTree.gen.ts`, no Vite plugin watcher. TanStack Start migration is near-zero refactor.
- **Route-level code-splitting** — each `<name>.page.tsx` ships as a lazy chunk (current floor: ~588 KB initial bundle, individual route chunks 1-43 KB). `defaultPreload: "intent"` triggers prefetch on hover/focus before the click — perceived latency near zero.
- **Devtools wired** in `app-providers.tsx` behind `import.meta.env.DEV` (TanStack Router devtools + React Query devtools, tree-shaken in prod).
- **TanStack Query** for all server state — session, active org, current membership, orgs list. Mutations via `mutationOptions` factories (call-site owns side-effects); hook wrappers only when side-effects always fire.
- **Forms**: `react-hook-form` + `@hookform/resolvers/zod` + shadcn `Form`. Mandatory `defaultValues`, never manual submit handlers.
- **Schema split** loose vs strict — same field validated differently in capture (sign-in) vs creation (sign-up / reset).
- **Theme**: `next-themes` (`attribute="class"`, `defaultTheme="system"`) + View Transitions API circle reveal with `prefers-reduced-motion` fallback.
- **Toasts**: `sonner`.

## App shell — top-nav + ⌘K palette ✅

- **Sticky header** with org switcher, theme toggle, user menu.
- **Contextual settings tabs** filtered by capability (`SETTINGS_TABS` declares `requires` + `requiresOrg`).
- **Command palette** (⌘K) — `NAVIGATION_ROUTES` filtered by capability.
- **Logo mark** — custom shadcn-pure primitive.

## UI — shadcn/ui (`@packages/ui`) ✅

Full shadcn/ui registry pre-installed, `shadcn-pure` rule enforced (use real slots, no `pt-6` / `space-y-4` patches).

- **Typography exports** — `TypographyH1` / `H2` / `H3` / `H4` / `P` / `Lead` / `Large` / `Small` / `Muted` / `InlineCode` / `Blockquote` / `List`. Never raw `<h1 className="text-5xl">`.
- **Custom primitives** (all `asChild`-compatible, all in `@packages/ui/components/ui/`):
  - `NavLink` — variants `plain` / `pill` / `underline` + `active` flag. Primitive owns style, router owns navigation: `<NavLink asChild variant="pill" active={isActive}><Link to="/x">…</Link></NavLink>`.
  - `BrandLink` — logo wordmark slot.
  - `TextLink` — inline underline-on-hover anchor.
  - `DestructiveActionDialog` — confirm-text dialog for irreversible actions.
  - `ListRow` — list-item primitive.
  - `FormTextField` — RHF `Controller` + shadcn `Input` wrapper (label + error + description).
- **Theme tokens** in `packages/ui/src/styles/globals.css` `@theme`. `className` reserved for layout (`flex`, `gap-*`, `mx-auto`); colors / typography / radius live in theme.

## DDD-kit (`@packages/ddd-kit`) ✅

Primitives for the business domain only (rule: never DDD for billing / auth / gating).

- `Result<T, E>` — no throw in domain or application.
- `Option<T>` — no `null` / `undefined` for absence.
- `Entity`, `Aggregate`, `ValueObject` (zod-validated via `protected validate()`), `UUID`, `DomainEvent`, `BaseRepository`, `UseCase`, `QueryHandler`.
- Events added in aggregate methods (`this.addEvent(...)`), dispatched in use cases AFTER successful persistence.

## Database — Drizzle + Postgres 17 ✅

- **Postgres on `localhost:5433`** (dedicated port, no clash with other local instances) via `docker compose up postgres -d`.
- **Schemas** in `packages/drizzle/src/schema/*.ts` — auth tables, organization tables.
- **`TransactionService`** — controllers manage transactions and pass to use cases.
- **`withOrg(table, orgId)` helper** for org-scoped list queries (rule: org-scoped tables NEVER queried without it).

## Tooling — zero-warning pipeline ✅

- **pnpm 10** + **Turborepo** (TUI, daemon-managed, `globalDependencies` bust caches on `biome.json` / `pnpm-workspace.yaml` / `.env*`).
- **Biome** — lint + format, single source.
- **knip** — unused exports / files.
- **jscpd** — duplication detection.
- **Husky + commitlint** — Conventional Commits enforced (lower-case subject).
- **lint-staged** — Biome on staged files only.
- **Pre-push** — full `pnpm ci:check`.
- **semantic-release** — `dev` → `main` merge commit triggers bundled bump + changelog. `feat` → minor, `fix`/`perf`/`refactor`/`build` → patch, `BREAKING CHANGE:` → major.
- **`bun test` (api) + `vitest` (packages, app)** — BDD style, mock at port level, test `Result` / `Option` transitions.

## Observability ✅

- **`pino`** + **`hono-pino`** — JSON in prod, `pino-pretty` in dev. `info` prod / `debug` dev. Status-driven HTTP log level (`5xx` → `error`, `4xx` → `warn`).
- **Single `app.onError(errorHandler)`** — `HTTPException` → `{ error: { code, message, requestId } }`. No per-route try/catch.
- **Request ID** propagated via `X-Request-Id` header; every log line carries it.
- **Sentry error tracking** (Phase 0.4) — `@sentry/bun` (api) + `@sentry/react` (app), NoOp without `SENTRY_DSN`. `errorHandler` captures `>= 500` automatically with `requestId/userId/orgId/path/method` tags ; `<Sentry.ErrorBoundary>` wraps the app provider tree. RGPD-clean scrubbing (whitelist drop of `Cookie`, `Authorization`, request body, query string, `email`, `username`, `ip_address`). `pinoIntegration` turns every `logger.warn|error` into a breadcrumb. `@sentry/vite-plugin` uploads source maps in CI when `SENTRY_AUTH_TOKEN`+`SENTRY_ORG`+`SENTRY_PROJECT` set. OTel + Prometheus `/metrics` deferred to Phase D.1 (Bun OTel manual + no Grafana consumer yet). See [`./OBSERVABILITY.md`](./OBSERVABILITY.md).

## Disaster recovery ✅ (doc-only)

PITR delegated to the managed Postgres provider (Neon/Supabase/RDS/Railway one-click) — primary defense. clean-stack ships no backup code on purpose: SOTA 2026 closed the case (pgBackRest unmaintained, providers ship PITR sub-minute RPO).

- **`docs/DISASTER-RECOVERY.md`** — RPO/RTO targets, 3-2-1 rule applied, PITR setup per provider, restore runbook, lifecycle + versioning snippets.
- **Weekly portable `pg_dump` export** — copy-paste recipes for GitHub Actions, Railway Cron, and K8s CronJob. Streams `pg_dump | gzip | aws s3 cp -` (no OOM). Targets `backups/postgres/<ISO>.sql.gz` in the existing S3 bucket. Read-only Postgres role mandated.
- **Monthly automated restore-test** — GitHub Actions workflow recipe spawns Postgres `:17-alpine`, downloads latest, restores, runs inline `psql count(*)` smoke check, fails loud.

See [`./DISASTER-RECOVERY.md`](./DISASTER-RECOVERY.md).

## Event-driven foundation ✅

Transactional outbox + dispatcher + audit/webhook subscribers. **Zero plumbing post-clone** — the dev declares an event in `packages/events`, calls `addEvent()` in their aggregate, runs the use case via `uow.run()` and the rest is automatic (audit log row, webhook fanout to subscribed clients, in-process handlers via `onEvent(...)` auto-discovered through inwire).

- **Outbox**: `outbox_event` table, UUID v7 PK, partial index on pending rows, `pg_notify` trigger ensured idempotently at boot (`CREATE OR REPLACE TRIGGER`).
- **Dispatcher**: in-process Bun worker, dedicated `pg.Client` LISTEN + 30s poll fallback + `SELECT ... FOR UPDATE SKIP LOCKED` drain (multi-instance safe). Built-in subscribers run inside the dispatch TX (atomic), user `onEvent` handlers post-commit (isolated).
- **Audit log** (`audit_log`, SOC2 §CC7.2 / ISO 27001) — append-only, retention `operational` (90d) vs `compliance` (7y) driven by `RETENTION_MAP`. Tamper-evidence columns posed (`prev_hash`/`hash`), calc gated by env flag.
- **Outbound webhooks** (`webhook_endpoint` + `webhook_delivery`) — HMAC-SHA256 signed (`t=<ts>,v1=<hex>` Stripe-style), AEAD-encrypted secrets at rest (`@noble/ciphers` XChaCha20-Poly1305 + HKDF per org). Decorrelated jitter retry (1m/5m/30m/2h/12h paliers), dead-letter after 5 attempts, replay endpoint. Claim window pattern in delivery worker — fetch HTTP outside TX, no lock starvation.
- **BetterAuth bridge** (`auth.ts`) emits 23 unique events automatically (15 user + 8 org) via 4 voies: user/session lifecycle (`databaseHooks`), MFA/passkey/email-verified/password-changed/profile-updated/email-change-requested/link-social (`hooks.after` with `createAuthMiddleware`, `APIError` filter), password reset / magic link (native callbacks), org/member/invitation (`organizationHooks`, with both `afterAddMember` AND `afterAcceptInvitation` for `ORG_MEMBER_JOINED` to cover direct adds + invite acceptance). RGPD service emits 5 more, UploadService emits 3, WebhooksService emits 3, PolicyAcceptanceService emits 1 (`user.policy.accepted`), SecurityMiddleware emits 3 (`security.rate_limit.exceeded`, `security.csp.violation`, `security.csrf.rejected`) → **38 events total**.
- **Catalog `@packages/events`** — 38 events with Zod payloads + `RETENTION_MAP`, shared api+app+future workers.
- **Request correlation** — every event carries the originating request's `X-Request-Id` in `outbox_event.metadata.requestId` (captured via an `AsyncLocalStorage` context, works inside BetterAuth hooks too), copied into `audit_log.request_id` so audit rows join to their logs + Sentry event on one key.

## Security & hardening ✅ Phase C.1

Deploy-safe perimeter — rate-limit, strict CSP, and stateless CSRF protection, all wired before any business feature.

**Rate-limit** (`apps/api/src/shared/middleware/rate-limit.middleware.ts`):

- Unified Hono middleware (`rate-limiter-flexible`); BetterAuth built-in rate-limit disabled — one policy wins, no double-counting.
- Policies: `global` (all routes) + 8 auth-burst policies (`/sign-in/email`, `/sign-up/email`, `/magic-link`, `/reset-password`, `/change-password`, `/verify-email`, `/two-factor`, `/passkey`) with tighter windows.
- IETF `RateLimit` / `RateLimit-Policy` / `Retry-After` headers on every rate-limited response.
- **Fail-closed on auth** — a store outage throws 503 on auth routes rather than silently skipping the guard (OWASP A10:2025). Global routes fail-open.
- Trusted-proxy IP resolution: `TRUSTED_PROXIES=private` (Railway/Fly), CIDR, or exact IP. OWASP rightmost-non-trusted algorithm — first untrusted IP wins.
- Store progression: memory (dev) → Postgres → Redis (swap without code change).
- Front: `sonner` toast on 429 with countdown from `Retry-After`.

**CSP** (Caddy + Vite, _not_ a Hono middleware):

- Per-request nonce via Caddy `{http.request.uuid}` injected into the `Content-Security-Policy` header; same value forwarded to Vite via `html.cspNonce` meta tag.
- `'strict-dynamic'` policy — no `'unsafe-inline'`, no host allowlist.
- Public `POST /csp-report` endpoint: IP-rate-limited, `Cross-Origin-Resource-Policy: cross-origin` (browsers need it for report delivery), document-uri origin filter (drops 3rd-party extension noise).
- Emits `security.csp.violation` audit event (`operational` retention).
- Trusted Types deferred (no eval/DOM-sink usage today — land when needed).

**CSRF** (`apps/api/src/shared/middleware/csrf.middleware.ts`):

- Origin-allowlist on unsafe HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`). Stateless — no token, no cookie, no endpoint to maintain (the Next.js Server Actions / SvelteKit model).
- Allowlist is the CORS origin list (`CORS_ORIGIN`) — single source of truth, zero drift.
- Bearer-skip: requests with `Authorization: Bearer …` bypass the check (Capacitor mobile, PATs, internal HMAC-signed calls).
- Emits `security.csrf.rejected` audit event (`operational` retention).

**Hardened headers** (Caddy, no Hono duplication):

- `Strict-Transport-Security` (HSTS, 1 year, includeSubDomains).
- `Content-Security-Policy: frame-ancestors 'none'` (clickjacking).
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` (camera, microphone, geolocation off by default).

**Prod boot guard**: api fails hard (`process.exit(1)`) on missing `CORS_ORIGIN` — a silent empty-string allowlist would make CSRF protection a no-op.

**Events** (3 new, `operational` retention): `security.rate_limit.exceeded` · `security.csp.violation` · `security.csrf.rejected`. Brings the catalogue to **38 events** (23 BetterAuth + 5 RGPD + 3 uploads + 3 webhooks + 1 policy + 3 security).

See [`./EVENTS.md`](./EVENTS.md) for the full DX guide (how to add an event, build a handler, multi-tenant safety, BetterAuth bridge specifics, HMAC verification, known limitations).

## Roadmap (not yet shipped)

See [`../ROADMAP.md`](../ROADMAP.md) for the full plan with constraints + extension points.

- **Billing** — Stripe via `@better-auth/stripe` (customer portal, subscriptions, signed webhooks, customer = per organization).
- **Feature & quota gating** — config + middleware layer (no DDD).
- **Admin & impersonation** — BetterAuth `admin` plugin.
- **Front UI for audit log + webhooks** — API ready, app-side pages remain.
- **Tamper-evidence audit hash chain** — columns posed, calc deferred until SOC2 audit demands.
- **Domain-event → telemetry subscribers** (Sentry breadcrumb / OTel span attr / Prom counter per event-type) — trivial `onEvent(...)` additions. Sentry capture on 5xx errors already wired via `IInstrumentation` (Phase 0.4); OTel + Prom subscribers land with Phase D.1 Grafana consumer.
- **i18n** — TanStack Router locale routes + typed message catalogs.
