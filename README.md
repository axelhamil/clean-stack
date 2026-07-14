<div align="center">

# clean-stack

**The SaaS boilerplate that says no.**
Auth, multi-tenant, email, storage already wired. You clone, you write business logic — everything else is settled.

**Bun + Hono** API · **Vite + React 19 + TanStack** app · **Drizzle + Postgres** · DDD-kit for the domain · BetterAuth + Resend + R2 for the SaaS layer.

</div>

---

> **Status — work in progress.** This boilerplate is under active iteration. No support, no SLA, no public issue queue.

---

## Quick start

Two ways to run it. Pick one.

### Option A — Native (fastest hot reload)

**Prerequisites** — [Bun 1.3+](https://bun.com/docs/installation), [Node 24+](https://nodejs.org), [pnpm 10](https://pnpm.io/installation), [Docker with Compose v2](https://docs.docker.com/compose/install/).

```bash
git clone https://github.com/axelhamil/clean-stack my-saas
cd my-saas
pnpm install
pnpm bootstrap          # copies .env.example → .env in each workspace
docker compose up postgres -d   # only Postgres on :5433 (api/app run natively below)
pnpm db:migrate         # apply migrations
pnpm dev                # API :3000, App :5173
```

### Option B — Fully containerized (Docker only)

No Bun, no Node, no pnpm on your host. Everything runs in containers (api + app + Postgres) with hot reload via [`compose develop.watch`](https://docs.docker.com/compose/how-tos/file-watch/).

**Prerequisites** — [Docker with Compose v2.22+](https://docs.docker.com/compose/install/) (the `develop.watch` minimum). Follow the official guide for your OS — do not use `apt install docker.io` (Canonical's package, not Docker Inc.).

| OS | Official guide |
|---|---|
| **macOS** | [Docker Desktop for Mac](https://docs.docker.com/desktop/setup/install/mac-install/) |
| **Windows** | [Docker Desktop for Windows (WSL2)](https://docs.docker.com/desktop/setup/install/windows-install/) |
| **Debian** | [Install Docker Compose on Debian](https://docs.docker.com/compose/install/linux/#install-using-the-repository) |
| **Ubuntu** | [Install Docker Compose on Ubuntu](https://docs.docker.com/compose/install/linux/#install-using-the-repository) |
| **Fedora** | [Install Docker Compose on Fedora](https://docs.docker.com/compose/install/linux/#install-using-the-repository) |
| **RHEL / Rocky / Alma** | [Install Docker Compose on RHEL](https://docs.docker.com/compose/install/linux/#install-using-the-repository) |
| **Arch / Manjaro** | [`extra/docker`](https://archlinux.org/packages/extra/x86_64/docker/) + [`extra/docker-compose`](https://archlinux.org/packages/extra/x86_64/docker-compose/) (already v2, no plugin needed) |
| **NixOS** | [Docker — NixOS Wiki](https://wiki.nixos.org/wiki/Docker) |

> [v1 (`docker-compose`, hyphen) is EOL since June 2023](https://docs.docker.com/compose/migrate/) — always use `docker compose` (space).

```bash
git clone https://github.com/axelhamil/clean-stack my-saas
cd my-saas
bash scripts/bootstrap.sh              # copies .env.example → .env in each workspace
docker compose up --watch              # api runs migrations on boot, then starts
```

Open [`http://localhost:5173`](http://localhost:5173), sign up with any email, you're in.

---

## Why bother

Most SaaS templates ship a half-baked auth you'll rip out and zero opinion on what goes where. This one starts from the opposite premise.

| | clean-stack |
|---|---|
| **Auth** | BetterAuth — passkeys (WebAuthn), 2FA (TOTP + backup codes), magic-link, DB-backed sessions, cross-tab sync via `BroadcastChannel`. Bearer alongside cookies for Capacitor. Native Bun + Hono, no hacks. |
| **Multi-tenant** | `organizationId` FK on every business table from migration #1 + `ScopedRepository` enforces it at the port. Personal org auto-created on signup, role-based invitations, ownership transfer. Bolting tenancy on later is hell — the reverse is free. |
| **Authorization** | Capability-based SSOT (`@packages/access-control`). **Same predicate** at server middleware, route `beforeLoad` gate, and `<Can requires={...}>` UI — drift impossible by construction. |
| **Legal / compliance** | Day-one EU-legal across the GDPR surface: **Art. 7** privacy/terms versioning (re-acceptance gate when a version bumps, `user.policy.accepted` evidence), **Art. 16** rectification (profile + email-change + password), **Art. 17** erasure (`POST /me/delete` — 2FA-required, 7-day soft-delete grace, sole-owner preflight, cancel-on-sign-in, cron wipe + ref anonymization), **Art. 20** portability (`POST /me/export` — signed 7-day R2 URL, 1/24h throttle). Passwords follow **NIST SP 800-63B** (min 15, HIBP k-anonymity breach check, contextual ban-list, no forced complexity). Without this, fines up to 4% of revenue. |
| **Direct uploads** | Three-step presign → `PUT` direct to provider → server `HeadObject` confirm. Server is blind during transfer; owner-scoped keys (`<userId>/<scope>/<uuid>-<filename>`); R2 / S3 / B2 / Wasabi / Tigris — provider swap = one env var. |
| **Internal endpoints** | `/internal/*` (cron, queues) HMAC-SHA256-signed (`X-Internal-Signature`); signing key never on the wire. Stack `private-network` on Railway/Fly via `INTERNAL_AUTH_LAYERS` for defense-in-depth. |
| **Event-driven + audit** | Transactional outbox + LISTEN/NOTIFY dispatcher → **52 typed events** auto-emitted on every state change (48 subscribable + 4 internal webhook events), append-only `audit_log` (SOC2 §CC7.2 / RGPD Art. 30), outbound webhooks (HMAC-signed, AEAD-encrypted secrets, decorrelated-jitter retry → dead-letter) — operator UI at `/settings/webhooks`, public event catalog at `/developers/events`. Each audit row carries the request's `X-Request-Id` via an `AsyncLocalStorage` context — one key joins an audit entry to its logs and Sentry event. |
| **DDD scope** | Reserved for what your customers pay for. Not for billing, auth, gating, or quotas (config + middleware suffices). Lesson learned the hard way: ~70% less code than full-DDD on the SaaS plumbing. |
| **Type safety** | Hono RPC end-to-end (`hcWithType`). No client to write, no schema to sync, refactor in API → red squiggle in App on save. |
| **Performance** | Bun-native `Bun.serve()` (~7 ms cold). Route-level code-splitting on the front (initial bundle ~588 KB, route chunks 1–43 KB) + `defaultPreload: "intent"` — perceived latency near zero. |
| **AI-pair ready** | `CLAUDE.md` at the root + per-layer sub-`CLAUDE.md`. Your agent already knows the rules — Result/Option, no `throw` in domain, capability gates, vertical-slice modules. |
| **Zero-warning pipeline** | Husky + lint-staged + commitlint + pre-push CI (Biome, knip, jscpd, type-check). Conventional Commits enforced; `dev`→`main` merge triggers semantic-release. No `--no-verify` shortcut. |

---

## Features

Everything wired today, and the build order for what's next. Prefer prose? [`docs/OVERVIEW.md`](docs/OVERVIEW.md) is the guided tour. Full inventory in [`docs/FEATURES.md`](docs/FEATURES.md); detailed plan with constraints in [`ROADMAP.md`](ROADMAP.md).

### Shipped

**Auth & identity**
- Email + password (required verification + reset), magic-link, passkeys (WebAuthn), 2FA (TOTP + backup codes)
- Active-session list & revoke · bearer tokens alongside cookies · 5-min session cookie cache · cross-tab sync (`BroadcastChannel`)
- NIST SP 800-63B password baseline — min 15, HIBP k-anonymity breach check (fail-open), contextual ban-list, no forced complexity

**Multi-tenant & authorization**
- `organization` plugin — Personal org auto-heal, team orgs, email invitations, role-based members, ownership transfer
- Capability-based authorization SSOT (`@packages/access-control`) — same predicate at server middleware, route `beforeLoad` gate, and `<Can>` UI

**Security & hardening** — *the deploy-safe perimeter (Phase C.1)*
- Unified rate-limit — one Hono middleware (`rate-limiter-flexible`, BetterAuth built-in disabled) → global + 8 auth-burst policies, multi-window, IETF `RateLimit`/`RateLimit-Policy`/`Retry-After` headers, **fail-closed on auth** (a store outage can't silently disable brute-force protection — OWASP A10:2025), trusted-proxy IP resolution (`private`/CIDR/exact, OWASP rightmost-non-trusted), memory → Postgres (dedicated pool) stores
- Strict CSP — per-request nonce (Caddy native `{http.request.uuid}` + Vite `html.cspNonce`), `'strict-dynamic'`, public `/csp-report` (IP-rate-limited + cross-origin CORP + document-uri origin filter) → `security.csp.violation` audit event
- CSRF — **Origin-allowlist on unsafe methods** (stateless, no token/cookie/endpoint — the Next.js Server Actions / SvelteKit model), reuses the CORS allowlist as SSOT, Bearer-skip for Capacitor, `security.csrf.rejected` audit event
- Hardened headers (HSTS, CSP `frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy via Caddy) · credentialed CORS allowlist · prod boot **fails hard** on missing `CORS_ORIGIN` / signing keys
- Abuse prevention (Phase C.1 s5a) — disposable/throwaway email domains refused at sign-up (~90k-domain list + DNS MX-record check, **fail-open**, `DISPOSABLE_EMAIL_BLOCK_ENABLED`) → `security.signup.rejected`; HIBP breach hit at sign-up/reset/change → `security.password.breached`

**Legal / compliance (GDPR)**
- Art. 7 — privacy/terms versioning + re-acceptance gate (`@packages/policies`, `/legal/accept`)
- Art. 16 — rectification (profile, email-change, password)
- Art. 17 — erasure (2FA-gated, 7-day grace, sole-owner preflight, cron wipe + ref anonymization)
- Art. 20 — portability (signed 7-day R2 export, 1/24h throttle)

**Storage & email**
- Direct uploads — three-step presign → PUT → confirm, owner-scoped keys (R2 / S3 / B2 / Wasabi / Tigris)
- Transactional email (Resend) — typed templates, idempotency, provider-side suppression

**Event-driven core & transactions** — *the hard distributed-systems part, already solved*
- Transactional outbox — domain events persisted in the **same DB transaction** as the state change (`IUnitOfWork.run()` + `EventCollector` AsyncLocalStorage) → no event ever lost, none emitted for a rolled-back write (the dual-write problem, solved)
- Post-commit dispatch — Postgres `LISTEN/NOTIFY` + `SELECT … FOR UPDATE SKIP LOCKED` drain (multi-instance safe); built-in subscribers run inside the dispatch TX (audit + webhook fanout), user `onEvent(...)` handlers isolated post-commit
- **52 typed events** (48 subscribable + 4 internal), append-only `audit_log` (operational 90d / compliance 7y), HMAC-signed webhooks (AEAD-encrypted secrets, decorrelated-jitter retry → dead-letter, replay, SSRF guard, dual-secret rotation), `X-Request-Id` correlation
- **Zero plumbing post-clone** — declare the event in `@packages/events` → `addEvent()` in the aggregate → run via `uow.run()`; the audit row, webhook fanout, and in-process handlers (auto-discovered via inwire) come for free
- Internal `/internal/*` endpoints — HMAC-signed, optional private-network layer

**Architecture & conventions** — *the part that keeps shipping fast sustainable*
- Clean Architecture + DDD **enforced by structure** — layers import inward, modules never import each other (only via domain events / shared ports), each module removable by a documented contract (`trash` + line delete, `tsc` points to the rest)
- **8 cross-cutting rules**, each tied to an architectural property with its *why* — every state change emits a typed event (audit + webhooks opt-out, not opt-in) · every I/O method spans + captures (no silent prod failure) · every event payload names its actor (RGPD forensic trail) · internal packages ship source not artifacts · ORM-first, raw SQL only where the ORM can't model it
- **DDD scoped to the business domain only** — never billing / auth / gating / quotas (config + middleware suffices); the discipline that cut ~70% of code vs full-DDD plumbing (lesson learned the hard way)
- **Domain & repo rules** — no `throw` in domain/application (`Result`), no `null` for absence (`Option`), value objects validated via zod, aggregates expose only `get id()`; ownership enforced at the port (`ScopedRepository` scopes `organizationId`/`userId` across HTTP, cron, queue, events — wrong owner leaks nothing)
- **Rules live next to the code** — root + per-layer `CLAUDE.md`, recursively auto-loaded; conventions are executable guardrails for AI agents and humans, not tribal knowledge

**Building blocks**
- DDD-kit (`@packages/ddd-kit`) — `Result` / `Option`, `Entity` / `Aggregate` / `ValueObject` (zod-validated) / `UUID` / `DomainEvent`, `BaseRepository` / `ScopedRepository` / `IUnitOfWork`
- Vertical-slice modular monolith — `modules/<context>/{domain,application,infrastructure}` + per-feature front slices
- CQRS (commands via use-cases, queries direct to Drizzle) · inwire DI (type-inference container, no declared interfaces)
- Drizzle + Postgres 17 — `TransactionService`, org-scoped `withOrg(table, orgId)` helper, dedicated port `5433`

**Frontend & UI**
- App shell — sticky top-nav, org switcher, theme toggle, user menu, ⌘K command palette (capability-filtered)
- TanStack Router code-based 2-file pattern (`route` + lazy `page`) — no codegen, no `routeTree.gen.ts`, near-zero TanStack Start migration
- Route-level code-splitting + `defaultPreload: "intent"` (initial bundle ~588 KB, route chunks 1–43 KB)
- TanStack Query server-state · RHF + zod forms (loose/strict schema split) · `next-themes` + View Transitions theme · `sonner` toasts
- shadcn-pure UI kit (`@packages/ui`) — typography exports + custom primitives (`NavLink`, `TextLink`, `FormTextField`, `DestructiveActionDialog`, `ListRow`), theme tokens, `<Can>` authz component

**Infra, ops & DX**
- Hono RPC end-to-end types (`hcWithType`) · `pino` logging with single error envelope · CQRS error contract
- Health probes (`/livez` `/readyz` `/startupz`) + graceful shutdown · Sentry error tracking (RGPD-scrubbed, NoOp without DSN)
- Disaster-recovery runbook (PITR-first) · Railway reference deploy (config-as-code)
- `pnpm bootstrap` clone-ability · Docker dev (native hot-reload **or** fully containerized `compose watch`) · Turborepo
- Zero-warning pipeline (Biome · knip · jscpd · type-check · commitlint · semantic-release)

### Roadmap

Build order for a boilerplate — deploy-safety + legal non-negotiables first, then revenue, then finish/polish. Phase IDs link to their full spec in [`ROADMAP.md`](ROADMAP.md).

- **M1 — Deploy-safe & legal** · ✅ rate-limit + strict CSP + CSRF + abuse quick-wins (s5a) **shipped** (Phase C.1 — see Security & hardening above; captcha + advanced abuse signals impossible-travel/geo still pending) · compliance docs (sub-processors, accessibility, DPA, DORA) · cookie consent + GPC/DNT
- **M2 — Revenue** · ✅ **B.1 billing via `@better-auth/stripe` shipped** (Stripe Checkout + Billing Portal + idempotent webhooks + seat gate + 3-tier entitlements + `/pricing` + `/settings/billing` — see Billing section above) · feature & quota gating (config + middleware, no DDD)
- **M3 — Finish half-shipped UIs** · ✅ **C.5 webhooks front shipped** (`/settings/webhooks` operator UI + public `/developers/events` catalog — see Event-driven section; SSRF guard + dual-secret rotation + auto-disable also landed) · audit-log admin page shipped (`/admin/audit-log`) · recovery-codes UI · privacy dashboard
- **M4 — Operate** · admin & impersonation (BetterAuth `admin` plugin) · API tokens / PATs (eval `@better-auth/api-key`) · OpenAPI docs (Scalar) · in-app notifications
- **M5 — Quality & compliance gates** · Playwright e2e (full legal chain) + Lighthouse a11y CI · SOC2 Type II checklist · status page + SLO dashboards + OTel/Prometheus
- **M6 — Enterprise & reach** · SSO SAML/OIDC + SCIM (BetterAuth `sso`) · i18n (TanStack locale routes + Lingui; `@better-auth/i18n` for auth errors) · Capacitor mobile · feature flags · marketing site

---

## Infrastructure

What's in `docker-compose.yaml`, what's optional, and how dev maps to prod.

### Database — Postgres 17

| | |
|---|---|
| **Image** | [`postgres:17-alpine`](https://hub.docker.com/_/postgres) |
| **Host port** | `5433` (deliberately not the default `5432` — avoids collision with a system Postgres) |
| **In-network** | `postgres:5432` (used by the api container) |
| **Volume** | `postgres_data` (persistent across `compose down`) |
| **Healthcheck** | `pg_isready` every 5 s — api waits for healthy before starting |
| **Schema** | [Drizzle ORM](https://orm.drizzle.team) — sources in `packages/drizzle/src/schema/` |

```bash
pnpm db:push            # dev — push schema directly (drizzle-kit push --force, non-TTY safe)
pnpm db:generate        # generate a SQL migration from a schema diff
pnpm db:migrate         # apply migrations (prod-style — ship as artifacts)
pnpm db:studio          # browse data in Drizzle Studio
```

> `db:push` runs with `--force` because Turbo pipes stdout in non-TTY, and drizzle-kit's interactive data-loss prompt would otherwise hang. Safe in dev. Prod uses `db:migrate` which doesn't prompt.

### Storage — S3-compatible (opt-in)

Object storage for uploads. **Off by default** — the `storage` profile is opt-in. Turn it on when you need it.

| | |
|---|---|
| **Dev image** | [`chrislusf/seaweedfs`](https://github.com/seaweedfs/seaweedfs) — Apache 2.0, ~96 MB ([why not MinIO?](https://docs.docker.com/blog/minio-archived/)) |
| **Compose profile** | `storage` (off by default) |
| **Host port** | pinned to `8333` (`ports: ["8333:8333"]`) |
| **In-network** | `seaweedfs:8333` (set as `S3_ENDPOINT` for the api) |
| **Bucket** | `clean-stack` — auto-created on startup by the `seaweedfs-init` sidecar |
| **Auth** | none required in dev — accepts any access key / secret |
| **Prod target** | [Cloudflare R2](https://developers.cloudflare.com/r2/) (zero egress fees) — same SDK, swap via `S3_ENDPOINT` + creds |

```bash
docker compose --profile storage up -d         # start SeaweedFS + bucket init
```

The S3 client is provider-agnostic ([`region: "auto"`, `forcePathStyle: true`](https://orm.drizzle.team/docs)). Anything S3-compatible works: R2, AWS S3, Backblaze B2, Wasabi, Scaleway, Tigris.

### Email — Resend (optional)

Resend is **optional everywhere** — without `RESEND_API_KEY` (or with unconfigured template IDs), email sends are logged at `warn` and the app boots normally; verification, magic-link, password-reset and org-invitation mails simply don't deliver. Wire it before relying on any email flow in prod.

| | |
|---|---|
| **SDK** | [`resend`](https://resend.com/docs) |
| **Templates** | dashboard-managed, retry + idempotency, provider-side suppression |
| **DNS prereq prod** | SPF + DKIM (3 CNAMEs) + DMARC — see [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md#email) |
| **EU region** | supported via `region: "eu-west-1"` in adapter config |

### Billing — Stripe (opt-in)

Billing is wired via `@better-auth/stripe` (plugin v1.6+, SDK `stripe@22+`). **Off until you add the two required env vars.** Without them the billing routes return `402` for all subscription calls; the rest of the app is unaffected.

| | |
|---|---|
| **Packages** | `stripe@22.3.0` + `@better-auth/stripe@1.6.23` |
| **Webhook endpoint** | auto-mounted at `/api/auth/stripe/webhook` by the plugin |
| **Subscription SSOT** | plugin-managed `subscription` table (webhook-synced) — not `organization.metadata` |
| **Entitlements** | typed `ENTITLEMENTS[tier]` in `apps/api/src/modules/billing/config.ts` — edit + deploy to change gates |
| **Tiers** | `free` (3 members) · `pro` (20 members, audit_log + api) · `business` (unlimited members + SSO) |
| **Unlimited** | `maxMembers: null` (JSON-safe) — not `Infinity` |
| **Org model** | unlimited team orgs per user; each is free or paid independently (seat-only gate) |

**Required env vars** (`apps/api/.env`):

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Dev webhook forwarding** (forwards Stripe events to your local API):

```bash
stripe listen --forward-to localhost:3000/api/auth/stripe/webhook
```

**Stripe product metadata contract** — each paid Product (Pro, Business) in the Stripe dashboard **must** carry:

- `metadata.tier` = the tier key (`pro` or `business`) matching a key in `ENTITLEMENTS`. This is the join key between Stripe and the entitlements config.
- `marketing_features` (Stripe product field) = array of bullet strings shown in the `/pricing` UI and Stripe Checkout.

Entitlements (features, rank, `maxMembers`) live **exclusively in code** at `apps/api/src/modules/billing/config.ts`. The Stripe dashboard never controls gates — it only carries the price and display copy. Changing a gate = a code change + deploy (reviewable, version-controlled).

### Containers at a glance

| Service | Image | Port (host) | Profile | Persistent volume |
|---|---|---|---|---|
| `postgres` | `postgres:17-alpine` | `5433` | default | `postgres_data` |
| `api` | built (`apps/api/dev.Dockerfile`) | `3000` | default | — |
| `app` | built (`apps/app/dev.Dockerfile`) | `5173` | default | — |
| `seaweedfs` | `chrislusf/seaweedfs` | `8333` | `storage` | `seaweedfs_data` |
| `seaweedfs-init` | `chrislusf/seaweedfs` | — | `storage` | — |

---

## Environment variables

Three `.env` files, on purpose. **Do not collapse them into one at the root** — it's a safety rail, not an oversight.

| File | Holds | Why isolated |
|---|---|---|
| `apps/api/.env` | DB password, auth secret, S3 keys, Resend key, RGPD/storage limits | Backend-only — never travels to the browser |
| `apps/app/.env` | `VITE_API_URL` and other `VITE_*` vars | **Vite inlines `VITE_*` into the client bundle** — these are publicly visible. Splitting prevents a backend secret from ending up in the JS bundle by mistake |
| `packages/drizzle/.env` | `DATABASE_URL` | Consumed by `drizzle-kit` at migration time (separate process, separate cwd) |

`pnpm bootstrap` (or `bash scripts/bootstrap.sh`) copies each `.env.example` → `.env` if missing. Idempotent — never overwrites.

Only three variables are **required to boot** in dev: `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`. Everything else is optional with sensible behavior when missing (storage off, email warns, etc.). **In production the api additionally fails hard** if `CORS_ORIGIN`, `INTERNAL_SIGNING_KEY`, `INTERNAL_AUTH_LAYERS` (incl. `signature`), or `WEBHOOK_MASTER_KEY` is missing — a silent fallback there is worse than a refused boot. Behind a proxy/PaaS, set `TRUSTED_PROXIES=private` (Railway/Fly) or every request shares the LB IP as rate-limit key (collective lockout). See [`apps/api/.env.example`](apps/api/.env.example) for the full template.

---

## Deployment

The api ships an **always-on event-driven rail** (transactional outbox + Postgres `LISTEN/NOTIFY` dispatcher + webhook delivery worker, all in-process). Two deployment shapes follow from this:

✅ **Compatible** — Railway, Fly.io, Render, Coolify, dedicated VM, Kubernetes/EKS/GKE/AKS. Anywhere the api process stays alive between requests.

🟡 **Compatible with `min_instances ≥ 1`** — Google Cloud Run, AWS App Runner, Azure Container Apps. They scale-to-zero by default; with zero replicas the dispatcher dies and `outbox_event` rows pile up unhandled. **Pin minimum 1 instance** (Cloud Run: `--min-instances=1`) and you're fine.

❌ **Incompatible without re-wiring** — Vercel Functions, Netlify Functions, AWS Lambda, Cloudflare Workers, edge runtimes generally. Functions terminate after the response, killing `LISTEN`. To go serverless, swap the in-process dispatcher for a cron-triggered drain endpoint or an external queue (Inngest, QStash, SQS) — see [`docs/EVENTS.md`](docs/EVENTS.md#deployment-requirements) for the workaround. Edge runtimes also can't run the Postgres LISTEN client at all — keep the api on a regular runtime; if you need edge for specific endpoints, split them into a separate service.

**Reference deploy (Railway)** — a prod-validated config-as-code runbook for the 3 services (api + app + cron) + Postgres + R2: env baseline, per-service `infra/railway/*.toml`, the boot-trap gotchas hit in practice (`NODE_ENV` override, app start-command, cross-site cookies), cookie strategy by domain topology, and a provider-swap section (Fly / Render / Cloud Run — Dockerfiles are portable). See [`docs/DEPLOY-RAILWAY.md`](docs/DEPLOY-RAILWAY.md).

**Health probes** — three endpoints (`/livez`, `/readyz`, `/startupz`) following K8s 2026 convention + IETF `draft-inadarei` format, with tri-state aggregation (pass/warn/fail) and `SIGTERM`-driven graceful shutdown. Per-PaaS recipes (Railway, Fly, Render, K8s, Cloud Run) in [`docs/HEALTH-PROBES.md`](docs/HEALTH-PROBES.md).

**Disaster recovery** — PITR-first (delegated to your managed Postgres provider), with copy-paste recipes for a weekly portable `pg_dump` export and a monthly automated restore-test. RPO/RTO targets, restore runbook, lifecycle + versioning snippets in [`docs/DISASTER-RECOVERY.md`](docs/DISASTER-RECOVERY.md).

**Observability** — error tracking via Sentry on api + app, RGPD-clean payload scrubbing by default, pino integration for log breadcrumbs, global TanStack Query/mutation error capture + user-id tagging on the front, NoOp without `SENTRY_DSN`. OpenTelemetry tracing and Prometheus `/metrics` are deferred to Phase D.1 (managed alongside dashboards). Port usage, removability runbook, provider swap recipe (GlitchTip / Highlight) in [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md).

---

## Stack

| Layer | Choice |
|---|---|
| **Runtime** | Bun 1.3+ (api, scripts, tests) · Node 24+ for tooling |
| **API** | Hono 4 on native `Bun.serve()` |
| **App** | Vite 8 · React 19 · TanStack Router/Query · Tailwind 4 · shadcn/ui |
| **Auth** | BetterAuth + `organization`, `twoFactor`, `passkey`, `magicLink`, `bearer` |
| **Email** | Resend (typed templates, idempotency, provider-side suppression) |
| **Storage** | Cloudflare R2 prod · SeaweedFS dev (S3-compatible, opt-in) |
| **DB** | Drizzle ORM + Postgres 17 |
| **API ↔ App** | Hono RPC (`hcWithType`) — end-to-end types |
| **DDD** | `@packages/ddd-kit` (Result, Option, Aggregate, ScopedRepository, …) |
| **Tooling** | pnpm 10 · Turborepo · Biome 2 · Husky · semantic-release · knip · jscpd |

---

## Documentation

| | |
|---|---|
| **Guided tour** | [`docs/OVERVIEW.md`](docs/OVERVIEW.md) — what you get, in plain terms |
| **What ships today** | [`docs/FEATURES.md`](docs/FEATURES.md) — file-level inventory |
| **What's next** | [`ROADMAP.md`](ROADMAP.md) — Phase 0 ✅; build order: M1 security perimeter + consent → M2 billing → M3 finish audit/webhooks/recovery UI → M4 admin + PATs → M5 e2e/a11y gates → M6 SSO/i18n/mobile |
| **Architecture rules** | [`CLAUDE.md`](CLAUDE.md) (root) and the per-layer sub-`CLAUDE.md` |
| **Integrations** | [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) — BetterAuth, Stripe, Resend, R2, email DNS |
| **Events** | [`docs/EVENTS.md`](docs/EVENTS.md) — DX guide · [`docs/EVENT_PIPELINE.md`](docs/EVENT_PIPELINE.md) — visual walkthrough |
| **Health probes** | [`docs/HEALTH-PROBES.md`](docs/HEALTH-PROBES.md) — endpoints, registry, graceful shutdown, per-PaaS recipes |
| **Disaster recovery** | [`docs/DISASTER-RECOVERY.md`](docs/DISASTER-RECOVERY.md) — PITR-first, restore runbook, weekly export + monthly restore-test recipes |
| **Observability** | [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md) — Sentry api+app, RGPD scrubbing, removability runbook, provider swap recipe |
| **Deploy (Railway)** | [`docs/DEPLOY-RAILWAY.md`](docs/DEPLOY-RAILWAY.md) — config-as-code runbook, boot-trap gotchas, cookie topology, provider swap |
| **History** | [`docs/HISTORY.md`](docs/HISTORY.md) — design decisions trail |

---

## Scripts

```bash
pnpm bootstrap          # copy .env.example → .env in each workspace (idempotent)
pnpm dev                # Turbo TUI (all apps)
pnpm dev:docker         # containerized dev (compose up --watch)
pnpm build              # full build with parallel type-check
pnpm test               # bun test (api) + vitest (rest)
pnpm ci:check           # pre-push pipeline (Biome, type-check, knip, jscpd)
pnpm db:push            # dev schema push
pnpm db:migrate         # prod-style migration
pnpm db:studio          # Drizzle Studio
```

---

<div align="center">

Made by [Axel Hamilcaro](https://axelhamilcaro.com) · © 2026-present — All rights reserved

</div>
