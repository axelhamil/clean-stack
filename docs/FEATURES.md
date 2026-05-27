# Features

Inventory of what ships in `clean-stack`. Everything below is wired, tested, and used in the codebase — clone, configure env, ship business logic.

For the as-built rationale (decisions, alternatives ruled out, security notes), see [`HISTORY.md`](./HISTORY.md). For what's planned, see [`../ROADMAP.md`](../ROADMAP.md).

---

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
- **BetterAuth bridge** (`auth.ts`) emits 21 unique events automatically (13 user + 8 org) via 4 voies: user/session lifecycle (`databaseHooks`), MFA/passkey/email-verified/password-changed/link-social (`hooks.after` with `createAuthMiddleware`, `APIError` filter), password reset / magic link (native callbacks), org/member/invitation (`organizationHooks`, with both `afterAddMember` AND `afterAcceptInvitation` for `ORG_MEMBER_JOINED` to cover direct adds + invite acceptance). RGPD service emits 5 more, UploadService emits 3 → **29 events total**.
- **Catalog `@packages/events`** — 29 events with Zod payloads + `RETENTION_MAP`, partagés api+app+future workers.

See [`./EVENTS.md`](./EVENTS.md) for the full DX guide (how to add an event, build a handler, multi-tenant safety, BetterAuth bridge specifics, HMAC verification, known limitations).

## Roadmap (not yet shipped)

See [`../ROADMAP.md`](../ROADMAP.md) for the full plan with constraints + extension points.

- **Billing** — Stripe via `@better-auth/stripe` (customer portal, subscriptions, signed webhooks, customer = per organization).
- **Feature & quota gating** — config + middleware layer (no DDD).
- **Admin & impersonation** — BetterAuth `admin` plugin.
- **Front UI for audit log + webhooks** — API ready, app-side pages remain.
- **Tamper-evidence audit hash chain** — columns posed, calc deferred until SOC2 audit demands.
- **Phase 0.4 observability subscribers** (Sentry/OTel/Prom) — trivial `onEvent` additions when those modules land.
- **i18n** — TanStack Router locale routes + typed message catalogs.
