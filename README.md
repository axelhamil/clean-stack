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
| **RGPD / CCPA** | Art. 17 erasure + Art. 20 portability shipped: `POST /me/export` (signed 7-day R2 URL, 1/24h rate-limit), `POST /me/delete` (2FA-required, 7-day soft-delete grace, sole-owner preflight, cancel-on-sign-in flow). Cron sweep wipes personal data + anonymizes refs. Day-one EU-legal — without this, fines up to 4% of revenue. |
| **Direct uploads** | Three-step presign → `PUT` direct to provider → server `HeadObject` confirm. Server is blind during transfer; owner-scoped keys (`<userId>/<scope>/<uuid>-<filename>`); R2 / S3 / B2 / Wasabi / Tigris — provider swap = one env var. |
| **Internal endpoints** | `/internal/*` (cron, queues) HMAC-SHA256-signed (`X-Internal-Signature`); signing key never on the wire. Stack `private-network` on Railway/Fly via `INTERNAL_AUTH_LAYERS` for defense-in-depth. |
| **DDD scope** | Reserved for what your customers pay for. Not for billing, auth, gating, or quotas (config + middleware suffices). Lesson learned the hard way: ~70% less code than full-DDD on the SaaS plumbing. |
| **Type safety** | Hono RPC end-to-end (`hcWithType`). No client to write, no schema to sync, refactor in API → red squiggle in App on save. |
| **Performance** | Bun-native `Bun.serve()` (~7 ms cold). Route-level code-splitting on the front (initial bundle ~588 KB, route chunks 1–43 KB) + `defaultPreload: "intent"` — perceived latency near zero. |
| **AI-pair ready** | `CLAUDE.md` at the root + per-layer sub-`CLAUDE.md`. Your agent already knows the rules — Result/Option, no `throw` in domain, capability gates, vertical-slice modules. |
| **Zero-warning pipeline** | Husky + lint-staged + commitlint + pre-push CI (Biome, knip, jscpd, type-check). Conventional Commits enforced; `dev`→`main` merge triggers semantic-release. No `--no-verify` shortcut. |

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

### Email — Resend (optional in dev)

Resend is **optional in dev** — without `RESEND_API_KEY`, email sends are logged at `warn` and the app continues. **Required in prod** — boot fails fast otherwise.

| | |
|---|---|
| **SDK** | [`resend`](https://resend.com/docs) |
| **Templates** | dashboard-managed, retry + idempotency, provider-side suppression |
| **DNS prereq prod** | SPF + DKIM (3 CNAMEs) + DMARC — see [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md#email) |
| **EU region** | supported via `region: "eu-west-1"` in adapter config |

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

Only three variables are **required to boot** the api: `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`. Everything else is optional with sensible behavior when missing (storage off, email warns, etc.). See [`apps/api/.env.example`](apps/api/.env.example) for the full template.

---

## Deployment

The api ships an **always-on event-driven rail** (transactional outbox + Postgres `LISTEN/NOTIFY` dispatcher + webhook delivery worker, all in-process). Two deployment shapes follow from this:

✅ **Compatible** — Railway, Fly.io, Render, Coolify, dedicated VM, Kubernetes/EKS/GKE/AKS. Anywhere the api process stays alive between requests.

🟡 **Compatible with `min_instances ≥ 1`** — Google Cloud Run, AWS App Runner, Azure Container Apps. They scale-to-zero by default; with zero replicas the dispatcher dies and `outbox_event` rows pile up unhandled. **Pin minimum 1 instance** (Cloud Run: `--min-instances=1`) and you're fine.

❌ **Incompatible without re-wiring** — Vercel Functions, Netlify Functions, AWS Lambda, Cloudflare Workers, edge runtimes generally. Functions terminate after the response, killing `LISTEN`. To go serverless, swap the in-process dispatcher for a cron-triggered drain endpoint or an external queue (Inngest, QStash, SQS) — see [`docs/EVENTS.md`](docs/EVENTS.md#deployment-requirements) for the workaround. Edge runtimes also can't run the Postgres LISTEN client at all — keep the api on a regular runtime; if you need edge for specific endpoints, split them into a separate service.

**Health probes** — three endpoints (`/livez`, `/readyz`, `/startupz`) following K8s 2026 convention + IETF `draft-inadarei` format, with tri-state aggregation (pass/warn/fail) and `SIGTERM`-driven graceful shutdown. Per-PaaS recipes (Railway, Fly, Render, K8s, Cloud Run) in [`docs/HEALTH-PROBES.md`](docs/HEALTH-PROBES.md).

**Disaster recovery** — PITR-first (delegated to your managed Postgres provider), with copy-paste recipes for a weekly portable `pg_dump` export and a monthly automated restore-test. RPO/RTO targets, restore runbook, lifecycle + versioning snippets in [`docs/DISASTER-RECOVERY.md`](docs/DISASTER-RECOVERY.md).

**Observability** — error tracking via Sentry on api + app, RGPD-clean payload scrubbing by default, pino integration for log breadcrumbs, NoOp without `SENTRY_DSN`. OpenTelemetry tracing and Prometheus `/metrics` are deferred to Phase D.1 (managed alongside dashboards). Port usage, removability runbook, provider swap recipe (GlitchTip / Highlight) in [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md).

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
| **What ships today** | [`docs/FEATURES.md`](docs/FEATURES.md) |
| **What's next** | [`ROADMAP.md`](ROADMAP.md) — RGPD/CCPA → Billing → Gating → Admin → Audit → i18n |
| **Architecture rules** | [`CLAUDE.md`](CLAUDE.md) (root) and the per-layer sub-`CLAUDE.md` |
| **Integrations** | [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) — BetterAuth, Stripe, Resend, R2, email DNS |
| **Events** | [`docs/EVENTS.md`](docs/EVENTS.md) — DX guide · [`docs/EVENT_PIPELINE.md`](docs/EVENT_PIPELINE.md) — visual walkthrough |
| **Health probes** | [`docs/HEALTH-PROBES.md`](docs/HEALTH-PROBES.md) — endpoints, registry, graceful shutdown, per-PaaS recipes |
| **Disaster recovery** | [`docs/DISASTER-RECOVERY.md`](docs/DISASTER-RECOVERY.md) — PITR-first, restore runbook, weekly export + monthly restore-test recipes |
| **Observability** | [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md) — Sentry api+app, RGPD scrubbing, removability runbook, provider swap recipe |
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
