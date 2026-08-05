# What you get

clean-stack is a production-ready SaaS foundation. It ships the plumbing every SaaS rebuilds from scratch — authentication, multi-tenancy, compliance, storage, email, an event backbone, and the operational surface to deploy it safely — and keeps your business domain isolated so a pivot never touches the foundation.

Clone it, set your environment variables, and start writing the code that makes your product yours. Everything below is wired, tested, and used in the codebase — not a checklist of intentions.

> New here? The [README](../README.md) has the one-minute pitch and quick start. This page is the guided tour. For the file-level inventory (paths, phases, as-built notes), see [`FEATURES.md`](./FEATURES.md). For what's planned, see [`../ROADMAP.md`](../ROADMAP.md).

---

## Authentication you won't rip out

Most templates ship an auth you replace in week one. This one is built on BetterAuth, native on Bun + Hono, with the modern methods already wired and manageable from a real settings page.

- Email + password with required verification and reset
- Passwordless magic-link
- Passkeys (WebAuthn) — registered and managed by the user, with conditional autofill on the sign-in field where the browser supports it
- Two-factor (TOTP) — an in-app setup flow with a scannable QR code and copyable backup codes; enable and disable without leaving the account page
- Active-session list with per-device revoke and a "sign out everywhere" action

Passwords follow the NIST SP 800-63B baseline: a 15-character minimum, a breach check against Have I Been Pwned (k-anonymity — the password never leaves your server), a contextual ban-list (no email, name, or app name inside the password), and no forced complexity rules. Sessions are database-backed with a short signature cache, so a revoke takes effect almost immediately. Sign-in state stays in sync across browser tabs. The web uses secure httpOnly cookies; mobile (Capacitor) uses bearer tokens — same backend, no forked auth.

## Multi-tenancy from the first migration

Retrofitting tenancy onto a single-user app is a rewrite. clean-stack carries an organization on every business table from migration number one, so the hard decision is already made — and the reverse (dropping tenancy you don't need) is free.

- A personal organization is created automatically on sign-up, self-healing and never deletable
- Team organizations with slug generation, email invitations, role-based members, and ownership transfer
- Empty team organizations are cleaned up automatically when the last member leaves

Ownership is enforced at the data layer, not only in HTTP middleware. A scoped repository refuses to read or write another tenant's rows at every entry point — HTTP request, cron job, queue worker, event handler. A cross-tenant leak isn't a bug you can forget to prevent; it's structurally out of reach.

## One authorization rule, three enforcement points

Authorization drifts when the API, the router, and the UI each reimplement "can this user do X". Here they don't. A single capability definition is the one source of truth, evaluated by the same predicate in three places:

- the server, as route middleware
- the router, as a navigation gate that runs before a page loads
- the interface, as a `<Can requires={…}>` component

Add a permission once and all three honor it. There is no second place to update, so they cannot disagree. Three built-in roles (owner, admin, member) cover organization management, billing, audit-log, and webhook capabilities out of the box, and a dev-only overlay renders the full role-by-capability matrix while you build.

## Legal on day one (GDPR / CCPA)

Compliance is built into the foundation, before any feature, so a clone deployed to EU users is compliant from the first commit. Getting this wrong is a fine of up to 4% of revenue.

- **Cookie consent (ePrivacy / Art. 7)** — CNIL-conform banner with Reject and Accept at the same visual prominence (same-level, same size — required since the 2025 CNIL enforcement wave). Four granular categories (necessary always on; functional, analytics, marketing default-off). Dual-layer: a `cc_sid` device cookie maps to a server-side `consent_record` (timestamped, append-only, legally durable). Guests are reconciled to their account automatically at login — no extra client round-trip. A `<ConsentGate category>` primitive and `useConsent(category)` hook gate any code on a specific category; `<AnalyticsScripts>` shows the pattern for a self-hosted script gated on the analytics category. GPC and DNT headers carry no legal weight in the EU (EDPB has not made them binding); the opt-in model satisfies GDPR without checking them.
- **Policy versioning (Art. 7)** — privacy-policy and terms versioning with a re-acceptance gate. Bump a version and every user is re-prompted; each acceptance is recorded with its timestamp and IP as durable evidence.
- **Rectification (Art. 16)** — users edit their profile, change their email (with re-verification), and change their password.
- **Erasure (Art. 17)** — a self-service delete that requires 2FA, holds a 7-day grace window (signing in cancels it), verifies the user isn't the sole owner of a shared organization, then a scheduled job wipes personal data and anonymizes references so shared audit trails stay intact.
- **Portability (Art. 20)** — a self-service export that emails a signed, 7-day download link, throttled to once a day.
- **Sub-processor disclosure (Art. 28)** — a public `/legal/sub-processors` page lists every sub-processor (active: Resend, Cloudflare R2, BetterAuth OAuth; planned: Stripe, GrowthBook, Umami) with purpose, region, and DPA link. The active/planned split keeps cloners aware of which additions require the 30-day advance notice to DPA contacts before going live.
- **Accessibility statement (EAA Art. 14, mandatory since June 2025)** — a public `/legal/accessibility` page declares WCAG 2.1 AA / EN 301 549 v3.2.1 conformance, known limitations, and a contact alias for accessibility complaints. The page itself follows the pattern it prescribes: one `<h1>`, real `<h2>` section headings, a labelled mailto link.

Public compliance pages cover data rights (`/legal/data-rights`), cookie categories (`/legal/cookies`), sub-processor disclosure (`/legal/sub-processors`), and the accessibility statement (`/legal/accessibility`). DPA and DORA-annex contract templates in `docs/legal/` cover EU enterprise client onboarding (a decision table routes: fintech → DPA + DORA annex; non-fintech EU B2B → DPA only).

## A perimeter that's safe to deploy

The boring-but-mandatory hardening is done and wired before any business route.

- **Rate limiting** — one unified policy (a global budget plus tighter windows on the eight auth-sensitive routes) with standard `RateLimit` and `Retry-After` headers. It fails *closed* on auth: if the rate-limit store goes down, auth routes return 503 rather than silently dropping brute-force protection. The store moves from in-memory to Postgres (on its own connection pool, so a request flood can't starve your app) when you scale past one replica.
- **Content Security Policy** — strict, with a per-request nonce and no `unsafe-inline`, plus a violation-reporting endpoint that turns browser reports into audit events.
- **CSRF** — a stateless origin-allowlist check on unsafe methods, the same model as Next.js Server Actions and SvelteKit: no token, no cookie, no endpoint to maintain.
- **Hardened headers** — HSTS, clickjacking protection, MIME-sniffing off, a strict referrer policy, and locked-down browser permissions, set at the edge.
- **Correct client IPs behind a proxy** — a trusted-proxy resolver walks `X-Forwarded-For` the OWASP way, so rate-limit keys and audit IPs are the real client, not your load balancer.
- **Abuse prevention at sign-up** — disposable and throwaway email domains are refused (a ~90,000-domain blocklist plus a DNS MX-record check, fail-open so a DNS blip never blocks a real user), and both a rejected sign-up and a compromised-password attempt are recorded as security events.
- **Fail-hard boot** — in production the API refuses to start with a missing origin allowlist or signing key, so a misconfiguration can't quietly disable a protection.

Every rejection — rate-limit, CSP violation, CSRF — is recorded as an audit event.

## Uploads without trusting the client, and email that never double-sends

Files go straight to your object store; your server never proxies the bytes. A three-step flow — presign, direct upload, server-side confirm — verifies size and type *after* the transfer and stores everything under owner-scoped keys, so one user can never reach another's files. The provider is a single environment variable: Cloudflare R2, AWS S3, Backblaze B2, Wasabi, or Tigris in production, SeaweedFS locally.

Email runs on Resend with nine typed templates and idempotency keys, so a retry never sends twice. Provider-side suppression keeps hard bounces and complaints from hurting your sender reputation. Without a key configured, emails log to stdout in dev instead of crashing — you can smoke-deploy before wiring the provider.

## The hard distributed-systems part, already solved

The event backbone is the piece most teams get wrong. Here it's a transactional outbox: a domain event is written in the *same* database transaction as the state change it describes. No event is ever lost, and none is emitted for a write that rolled back — the dual-write problem, solved. A dedicated Postgres `LISTEN/NOTIFY` connection dispatches events the moment the transaction commits, with a 30-second poll as a safety net and row-level locking so multiple replicas share the work without a coordinator, a leader election, or Redis.

- **54 typed events** (50 subscribable + 4 internal) are emitted automatically on every state change — auth, organization, upload, compliance, consent, security, billing, and webhook actions all included. Each payload is Zod-validated before it's written, so a malformed event rolls back its own transaction instead of corrupting the log.
- An **append-only audit log** (90-day operational and 7-year compliance retention) satisfies SOC 2 and GDPR Art. 30. Every row names the actor who triggered it and is correlated to its request and error trace by a single ID. It's queryable through a capability-gated admin endpoint with actor, target, action, and time-range filters.
- **Outbound webhooks** are a full feature, not just a signer: per-organization endpoints subscribe to the event types they care about (exact names, group wildcards like `billing.*`, or `*`), deliveries are HMAC-signed (Stripe-style), secrets are encrypted at rest and rotatable with a grace window (both old and new secrets sign during rotation so consumers can migrate without downtime), failed deliveries retry with decorrelated jitter and dead-letter after five attempts, and every delivery — including every individual HTTP attempt's request/response headers and body — is logged and individually replayable. Endpoints that keep failing auto-disable, surfacing a distinct badge from a user-paused endpoint. Webhook URLs are validated against a SSRF blocklist at registration and again at delivery time to prevent DNS-rebinding. The operator UI lives at `/settings/webhooks`; a public reference of all 50 subscribable events (with JSON schema per event type and a ready-to-paste Node.js verification snippet) is at `/developers/events`.

For your own code this is opt-out, not opt-in: declare an event, add it in your aggregate, run the use case — the audit row, the webhook fan-out, and any in-process handlers (auto-discovered, no registration list) happen for free.

## Production operations, not a homework assignment

Most boilerplates hand you an app and leave "make it deployable" as an exercise. This one ships the operational surface.

- **Health probes** — `/livez`, `/readyz`, and `/startupz` in the IETF health-check format that Datadog, Grafana, and Kubernetes parse natively. Readiness aggregates self-registering per-module checks into a three-state result (healthy / degraded-but-serving / down), so one flaky non-critical dependency doesn't pull the whole pod out of rotation. Probes run outside all middleware and logging, so a 5-second probe interval doesn't drown your logs.
- **Graceful shutdown** — on `SIGTERM`, readiness flips to 503 immediately, in-flight requests get a grace window to drain, then the event dispatcher and webhook worker stop cleanly. No more intermittent 502s on every deploy.
- **Scheduled jobs, scheduler-agnostic** — the recurring work (processing due account deletions, sweeping expired audit / outbox / webhook rows by retention policy) lives behind internal endpoints you point *any* scheduler at: Railway Cron, GitHub Actions, a Kubernetes CronJob. A reference Railway cron config and a ready-to-run sweep entrypoint are included.
- **Internal endpoints are signed, not just hidden** — `/internal/*` requires an HMAC-SHA256 signature (the signing key never travels on the wire) with an optional private-network layer on top for PaaS internal meshes.
- **Observability, off until you want it** — Sentry on both API and app, resolving to a no-op until you set a DSN. When on: errors captured with request/user/org/path tags, structured logs promoted to breadcrumbs, GDPR scrubbing on by default (whitelist-based, EU data-residency option), and a span around every I/O call. One request ID threads an audit row to its logs and its error report. Swappable for GlitchTip or Highlight by changing a DSN.
- **Disaster recovery, decided for you** — point-in-time recovery from your managed Postgres provider is the primary defense (setup pointers per provider included); on top of it, copy-paste recipes for a weekly portable `pg_dump` export to your own bucket and a monthly automated restore-test that fails loudly if a backup ever won't restore.

## Deploy it the way it's meant to go

- **Config-as-code** — the reference deployment (Railway, three services: api, app, cron) is entirely in version-controlled `.toml`, nothing dashboard-only, with selective rebuilds so touching the frontend doesn't rebuild the API.
- **Provider-portable** — the Dockerfiles are standard; moving to Fly.io, Render, or Cloud Run is a config file and an env migration, and the cron entrypoint is platform-agnostic.
- **Graceful degradation** — optional services fail soft: no email key logs to stdout, no storage key surfaces as a non-critical readiness warning. The app boots; you wire providers when you're ready.

## Architecture that keeps shipping fast — sustainably

"Done beats perfect" applies to features. The structure underneath is deliberate, because that discipline is what lets fast shipping last.

- **Clean Architecture + DDD enforced by structure** — layers only import inward, modules never import each other (they communicate through domain events and shared ports), and each module is removable by a documented contract. That last claim is tested: removing the entire GDPR module in a dry run touched 46 files, cut ~3,000 lines, and left every quality gate green in under an hour.
- **No lock-in, by design** — every external dependency sits behind a port with a swap path: storage provider by env var, email/observability provider by config, rate-limit store by enum, even the event dispatcher for a serverless target. Nothing external is welded to your business code.
- **DDD scoped to your actual business domain** — never billing, auth, gating, or quotas, which stay as plain typed config plus middleware. That single rule cut roughly 70% of the code a naive all-DDD approach writes for the plumbing.
- **Domain rules with teeth** — no exceptions thrown in the domain (a `Result` type instead), no `null` for absence (an `Option` type), value objects validated at the boundary, and a typed error system that maps to HTTP status codes in one place.
- **Rules live next to the code** — a `CLAUDE.md` at the root and one per layer, auto-loaded, so an AI pair-programmer and your teammates work from the same guardrails instead of tribal knowledge.

## Per-organization billing, without a billing backoffice

Monetizing a multi-tenant SaaS means wiring Stripe subscriptions, keeping the subscription state consistent with webhooks, enforcing feature and seat limits at every entry point, and presenting a coherent pricing page. Here all of that is already wired.

Subscriptions are per organization — each org is either free (3 members, no premium features) or on a paid plan. The subscription state lives in the plugin's `subscription` table, kept current by webhook sync. It is never stored in `organization.metadata` — that pattern diverges under out-of-order webhooks and cannot be queried with a typed ORM.

The catalog is split deliberately: prices and display copy live in Stripe (changing them requires no deploy), and feature entitlements live in typed code (changing them requires a code review). A single field, `metadata.tier` on the Stripe Product, is the join key between the two. The boilerplate ships without Stripe keys configured and degrades cleanly to a free-only catalog — the app starts before you connect a payment provider.

Three gate axes cover every billing enforcement need:

- **Role** — `billing:read` lets owners and admins see the subscription page; `billing:manage` (owner only) is required for portal redirects that can cancel or downgrade.
- **Seats** — a `maxMembers` cap from the entitlements config is enforced in every org-membership hook (add, invite, accept). Unlimited is represented as `null`, which is JSON-safe and unambiguous in code.
- **Tier and features** — `requireFeature(flag)` and `requirePlan(minTier)` on the API return a `402 BILLING_PAYMENT_REQUIRED` response (semantically distinct from `403`). `<FeatureGate>` and `<PlanGate>` on the frontend gate any subtree declaratively. `useEntitlements()` gives imperative access to the current org's resolved plan.

The app provides a public `/pricing` page (plan grid fed from the live Stripe catalog, with pricing bullets from `marketing_features`) and a `/settings/billing` page (current plan, seat usage, Upgrade button → Checkout, Manage button → Portal). Four audit events are emitted automatically on every subscription lifecycle change. Quota gating ships as a dormant skeleton: a typed quota catalog, atomic-reserve middleware, `quota_usage` store, and front `useQuota`/`<QuotaGate>` primitives are wired and knip-whitelisted — activating a quota on any resource requires adding a key to the catalog and two call-site lines. See [`docs/QUOTA-GATING.md`](docs/QUOTA-GATING.md) for the activation guide.

## A frontend that's already assembled

- An **app shell** — sticky navigation, organization switcher, theme toggle, user menu, and a ⌘K command palette that navigates, switches org, changes theme, and only shows what the current user is allowed to reach
- Complete **account, organization, and privacy screens** — profile with avatar upload, password change, passkey management, 2FA setup with recovery codes, member invitations and role management, ownership transfer, contextual danger zones (delete-account at the bottom of the Account page; org leave/delete at the bottom of the Organization page), and a `/settings/privacy` hub for active-session revoke, data export, consent management, policy acceptance status, and sub-processor disclosure
- **Vite + React 19 + TanStack Router/Query** with a two-file route pattern and no code-generation step
- **Route-level code-splitting** with hover-intent preloading, so navigation feels immediate
- Forms on **React Hook Form + Zod**, a **shadcn/ui** component kit (base primitives plus purpose-built ones like a reveal-toggle password field and a typed-confirmation destructive dialog), system-aware theming with an animated view-transition, and toast notifications with a live countdown on rate-limit errors

## Developer experience

- **End-to-end type safety over the API** (Hono RPC) — no client to write and no schema to keep in sync; a change in the API surfaces as a red squiggle in the app on save
- **Dependency injection with no boilerplate** — `inwire`, a type-inference container, wires everything with no hand-written interfaces and no registration order to maintain; the compiler catches a missing or mistyped dependency, and swapping a provider is a one-line binding change. CQRS keeps writes (use cases) and reads (direct queries) clearly separated
- **One command to clone and run**, Docker for either native hot-reload or a fully containerized dev loop with file-sync, and Turborepo caching
- **A zero-warning pipeline** — lint, format, dead-code and duplication checks, type-check, Conventional Commits, and automated releases (semantic-release) enforced by git hooks — with no `--no-verify` escape hatch

## What's next

The roadmap follows a boilerplate's natural order — deploy-safety and legal first, revenue, then finish and polish.

- **Operate** — admin and impersonation, API tokens, OpenAPI docs, in-app notifications
- **Reach** — SSO (SAML / OIDC) with SCIM, internationalization, Capacitor mobile, and a marketing site

The full plan, with constraints and extension points, lives in [`../ROADMAP.md`](../ROADMAP.md).

---

## Go deeper

| | |
|---|---|
| The pitch and quick start | [README](../README.md) |
| File-level inventory | [`FEATURES.md`](./FEATURES.md) |
| What's planned | [`../ROADMAP.md`](../ROADMAP.md) |
| Modules and how they're removed | [`MODULES.md`](./MODULES.md) · [`REMOVABILITY.md`](./REMOVABILITY.md) |
| Integrations (BetterAuth, Stripe, Resend, R2, DNS) | [`INTEGRATIONS.md`](./INTEGRATIONS.md) |
| Event system (DX guide + walkthrough) | [`EVENTS.md`](./EVENTS.md) · [`EVENT_PIPELINE.md`](./EVENT_PIPELINE.md) |
| Health probes and graceful shutdown | [`HEALTH-PROBES.md`](./HEALTH-PROBES.md) |
| Scheduled jobs and internal auth | [`CRON.md`](./CRON.md) |
| Storage | [`STORAGE.md`](./STORAGE.md) |
| Observability | [`OBSERVABILITY.md`](./OBSERVABILITY.md) |
| Disaster recovery | [`DISASTER-RECOVERY.md`](./DISASTER-RECOVERY.md) |
| Deploy (Railway) | [`DEPLOY-RAILWAY.md`](./DEPLOY-RAILWAY.md) |
| Design decisions trail | [`HISTORY.md`](./HISTORY.md) |
