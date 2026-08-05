# Deploy to Railway (reference)

Runbook for shipping clean-stack on Railway. Config-as-code lives under `infra/railway/*.toml`. The provider switch out (Fly.io, Render, Cloud Run) is documented at the bottom — Dockerfiles are portable.

> **TL;DR**: 3 services (`api`, `app`, `cron`) + 1 Postgres add-on + 1 Cloudflare R2 bucket (external). Each service points at `infra/railway/<service>.toml`. Shared secrets centralized via Railway **Shared Variables**, referenced as `${{shared.NAME}}`.

---

## 0. Hard requirements & gotchas (read this first)

The non-obvious failure modes that crash a fresh deploy. Every one below was hit bringing this reference up — each produces a confusing or **log-less** failure.

**Boot is fail-hard on these (prod) — the API refuses to start without them:**

- `NODE_ENV=production` (see the trap below)
- `BETTER_AUTH_SECRET` (≥ 32 chars), `INTERNAL_SIGNING_KEY` (≥ 32 chars), `WEBHOOK_MASTER_KEY` (64 hex), and `INTERNAL_AUTH_LAYERS` must include `signature`. Missing any → boot throws in `apps/api/src/shared/env.ts`.
- `APP_URL` (public app URL, e.g. `https://app.example.com`) — Zod-required in `env.ts` at any `NODE_ENV`; the API refuses to boot if the value is absent or not a valid URL. Auth email links, the CSP-report origin filter, and the impersonation notification email all derive from it. The `.env.example` provides `http://localhost:5173` as the dev default.

**Boot degrades gracefully on these — the API starts, the feature stays inert until configured:**

- `RESEND_*` unset → emails are **logged to stdout, not delivered** (sign-up verification, magic link, password reset, org invitation silently don't send). Warn at boot, no crash.
- `S3_*` unset → uploads return `STORAGE_PROVIDER_FAILURE`; `/readyz` reports `storage:s3 fail` (non-critical). Warn at boot, no crash.
- ⇒ You **can** smoke-deploy without R2/Resend, but those flows won't actually work until the vars are set.

**`NODE_ENV` trap.** The Dockerfile sets `ENV NODE_ENV=production`, but a Railway **service variable** `NODE_ENV=development` *overrides it at runtime* (service vars beat Dockerfile `ENV`). In dev mode the logger loads `pino-pretty` — a devDependency absent from the `--prod` install → instant boot crash (`unable to determine transport target for "pino-pretty"`). Fix: set `NODE_ENV=production` explicitly, or don't set `NODE_ENV` at all (let the Dockerfile win). Never `development` in prod.

**`app` service: leave the Start Command EMPTY.** The app runner image is `caddy:2.11-alpine` — no Node, no pnpm. The Dockerfile `CMD` runs `caddy run …`. A Railway **Start Command** override (e.g. a leftover `pnpm --filter app start`) *replaces* the Caddy CMD → the container exits instantly with **zero logs**, the healthcheck never passes, the deploy fails silently and looks like a phantom. Settings → Deploy → **Start Command must be blank** for `app`.

**Cross-site auth cookies.** On Railway-generated domains, `app` and `api` sit on different `*.up.railway.app` hosts = different sites (`up.railway.app` is a public suffix). BetterAuth's session cookie must be `SameSite=None; Secure` to survive a cross-site credentialed `fetch` — already wired (`apps/api/src/auth.ts`: `sameSite: isProd ? "none" : "lax"`). With a **custom domain under one parent** (`api.x.com` + `app.x.com`) the cookie is same-site → `SameSite=Lax` works and is preferable. See §8.

**Deploys build from the connected branch.** Changing a variable, hitting *Redeploy*, or pushing all rebuild from the GitHub branch wired to the service (`main`). `railway up` is the only path that deploys local working-tree code — handy for validation, but it does **not** populate `RAILWAY_GIT_*` vars, so build-info shows `unknown` until a real branch deploy.

---

## 1. Prerequisites

**Required for any deploy:**
- Railway account (Hobby plan minimum — Pro recommended for PITR + EU region)
- GitHub repo connected to Railway
- Domain control (or use Railway-provided `*.up.railway.app` subdomain)

**Optional — the API boots without them, features stay inert until configured (see §0):**
- Cloudflare account (R2 bucket, EU jurisdiction) — needed for uploads
- Resend account (verified sending domain SPF+DKIM+DMARC, EU region) — needed for any email flow
- Sentry account (EU residency: `*.eu.sentry.io` DSN) — needed for error tracking

Local tooling: `railway` CLI (`npm i -g @railway/cli` or `brew install railway`).

---

## 2. Create project + link Postgres

```bash
# Option A — link to an existing project
railway link <project-id>

# Option B — create from scratch
railway init
```

Add the Postgres add-on (managed, includes PITR on Pro):

```bash
railway add --database postgres-ssl
```

Set the region to `europe-west4` (Amsterdam) via the dashboard for RGPD compliance: **Settings → Region**.

The add-on exposes `${{Postgres.DATABASE_URL}}` to other services — never copy the URL by value.

---

## 3. Create the 3 services

For **each** service (`api`, `app`, `cron`) — either via dashboard (recommended for first deploy) or CLI:

### Dashboard flow

1. **New Service → Deploy from GitHub repo** → select the repo, branch `main`
2. **Settings → Service**:
   - **Root Directory**: `/` (repo root — shared monorepo pattern, lets the Dockerfile resolve `packages/`)
   - **Config-as-code Path**: `infra/railway/<service>.toml`
3. **Variables**: see §4 below
4. (api + app only) **Networking → Public Networking → Generate Domain** (or attach custom domain later)

### Why root directory = `/`

clean-stack ships internal packages from source (`packages/*` → `src/`). The Docker build context must include the whole repo so pnpm workspace resolves and Bun's bundler inlines deps. Per-service config files at `infra/railway/<service>.toml` decouple per-service settings from the build context.

---

## 4. Environment variables

### Shared Variables (Project Settings → Shared Variables)

Set these **once at project level**, then reference from each service:

| Variable                | Generate                              | Used by         |
| ----------------------- | ------------------------------------- | --------------- |
| `BETTER_AUTH_SECRET`    | `openssl rand -base64 32`             | api             |
| `INTERNAL_SIGNING_KEY`  | `openssl rand -hex 32` (min 32 chars) | api + cron      |
| `WEBHOOK_MASTER_KEY`    | `openssl rand -hex 32` (64 hex chars) | api             |
| `RESEND_API_KEY`        | Resend dashboard (live key)           | api             |
| `RESEND_FROM`           | `onboarding@<your-verified-domain>`   | api             |
| `S3_ENDPOINT`           | `https://<account>.r2.cloudflarestorage.com` | api      |
| `S3_REGION`             | `auto`                                | api             |
| `S3_BUCKET`             | `clean-stack` (or your bucket name)   | api             |
| `S3_ACCESS_KEY`         | R2 dashboard → Manage API Tokens      | api             |
| `S3_SECRET_KEY`         | R2 dashboard → Manage API Tokens      | api             |
| `S3_FORCE_PATH_STYLE`   | `false` (R2 uses subdomain style)     | api             |
| `S3_PUBLIC_URL`         | `https://<bucket>.<account>.r2.cloudflarestorage.com` | api |
| `SENTRY_DSN`            | Sentry api project DSN (EU)           | api             |
| `SENTRY_ENVIRONMENT`    | `production`                          | api             |

### Per-service Variables

**`api`** service:

```env
NODE_ENV=production                           # NEVER "development" in prod — see §0 NODE_ENV trap
PORT=${{PORT}}                                # Railway injects automatically
DATABASE_URL=${{Postgres.DATABASE_URL}}
BETTER_AUTH_URL=https://api.<your-domain>     # or ${{RAILWAY_PUBLIC_DOMAIN}}
BETTER_AUTH_SECRET=${{shared.BETTER_AUTH_SECRET}}
APP_URL=https://app.<your-domain>             # REQUIRED — Zod env schema (any env); email links + CSP filter + impersonation email
CORS_ORIGIN=https://app.<your-domain>     # REQUIRED — api fails hard at boot without it (no localhost fallback)
TRUSTED_PROXIES=private                       # trusts Railway's edge-proxy private range → real client IP from XFF (else: collective lockout)
RATE_LIMIT_STORE=postgres                     # durable + shared across replicas; "memory" is per-replica (under-counts when scaled)
RESEND_API_KEY=${{shared.RESEND_API_KEY}}
RESEND_FROM=${{shared.RESEND_FROM}}
INTERNAL_SIGNING_KEY=${{shared.INTERNAL_SIGNING_KEY}}
INTERNAL_AUTH_LAYERS=signature                # add ",private-network" if Railway private mesh is on
WEBHOOK_MASTER_KEY=${{shared.WEBHOOK_MASTER_KEY}}
S3_ENDPOINT=${{shared.S3_ENDPOINT}}
S3_REGION=${{shared.S3_REGION}}
S3_BUCKET=${{shared.S3_BUCKET}}
S3_ACCESS_KEY=${{shared.S3_ACCESS_KEY}}
S3_SECRET_KEY=${{shared.S3_SECRET_KEY}}
S3_FORCE_PATH_STYLE=${{shared.S3_FORCE_PATH_STYLE}}
S3_PUBLIC_URL=${{shared.S3_PUBLIC_URL}}
SENTRY_DSN=${{shared.SENTRY_DSN}}
SENTRY_ENVIRONMENT=${{shared.SENTRY_ENVIRONMENT}}
GIT_SHA=${{RAILWAY_GIT_COMMIT_SHA}}           # surfaced at /internal/build-info (HMAC-gated, see §9), NOT on public /livez
BUILD_TIME=${{RAILWAY_GIT_COMMIT_MESSAGE}}    # Railway has no build-timestamp ref; commit subject is the closest marker
```

> Both `GIT_SHA`/`BUILD_TIME` only resolve on a **branch deploy** (GitHub push / redeploy). A `railway up` from your machine leaves them empty → build-info shows `unknown`. That's expected, not a bug.

**`app`** service:

| Var                     | Value                                | Type          |
| ----------------------- | ------------------------------------ | ------------- |
| `VITE_API_URL`          | `https://api.<your-domain>`          | **Build arg** |
| `VITE_SENTRY_DSN`       | Sentry app project DSN (EU)          | Build arg     |
| `VITE_SENTRY_ENVIRONMENT` | `production`                        | Build arg     |
| `VITE_GIT_SHA`          | `${{RAILWAY_GIT_COMMIT_SHA}}`        | Build arg     |
| `PORT`                  | (Railway injects)                    | Runtime       |

**Build args** (`VITE_*`) are baked into the bundle at build time. Set them under **Settings → Build → Build Args** (not Variables). Changing them requires a fresh build.

**`cron`** service:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}        # only if the cron ever runs migrations
API_URL=https://api.<your-domain>              # or ${{api.RAILWAY_PUBLIC_DOMAIN}}
INTERNAL_SIGNING_KEY=${{shared.INTERNAL_SIGNING_KEY}}
SENTRY_DSN=${{shared.SENTRY_DSN}}              # so cron failures are captured
SENTRY_ENVIRONMENT=production
```

---

## 5. Storage: Cloudflare R2 (default)

Why R2 over Railway Bucket: **10 GB free + zero egress + $4.50/1M class A**. Railway Bucket charges egress service→bucket (public network) — invisible until the bill arrives.

Setup:

1. Cloudflare dashboard → **R2 → Create bucket** → name `clean-stack`, jurisdiction **EU**
2. **Bucket settings → Public access**: keep **disabled** (signed URLs only)
3. **Lifecycle rules**: add 2 rules
   - `tmp/` prefix → expire after **30 days**
   - `backups/` prefix → expire after **365 days** (aligns `docs/DISASTER-RECOVERY.md`)
4. **Manage API tokens → Create API token**, scope to this bucket only (Object Read+Write)
5. Copy `Access Key ID` + `Secret Access Key` into Railway Shared Variables (see §4)
6. `S3_ENDPOINT` format: `https://<account-id>.r2.cloudflarestorage.com` (no bucket suffix)
7. `S3_PUBLIC_URL` format: `https://<bucket>.<account-id>.r2.cloudflarestorage.com`

### Alternative: Railway Bucket

Single-vendor simplicity at the cost of egress charges (service→bucket is over the public network on Railway, not private). Cost calc for 5 GB stored / 50K writes / 500K reads / 20 GB egress:

| Item            | Cloudflare R2          | Railway Bucket             |
| --------------- | ---------------------- | -------------------------- |
| Storage         | $0 (free tier)         | $0.075                     |
| Operations      | ~$0.40                 | $0 (unlimited)             |
| Egress (bucket) | $0                     | $0                         |
| Egress (svc→)   | N/A                    | **billed** (public)        |
| **Total**       | **~$0.40**             | depends on traffic         |

If you choose Railway Bucket: `railway add --bucket <name>`, region `europe-west4`. Same `S3_*` env vars, `S3_FORCE_PATH_STYLE=true`, `S3_ENDPOINT` from the bucket's "Connect" tab.

---

## 6. Resend (email)

1. Resend dashboard → **Domains → Add Domain** → verify SPF + DKIM + DMARC
2. **Settings → Region → EU** (irrelevant for routing, matters for log residency)
3. **API Keys → Create** with `sending_access` scope only — store as `RESEND_API_KEY` shared var
4. `RESEND_FROM=onboarding@<your-verified-domain>` (or any address on the verified domain)
5. The 8 template IDs are hardcoded **empty** in `apps/api/src/shared/services/email.service.ts` (`TEMPLATE_IDS`) — fill each from the Resend dashboard when cloning. Empty IDs (or a missing `RESEND_API_KEY`) no longer crash the boot: the service logs a warning and those emails are **logged, not delivered**. Set `RESEND_API_KEY`, `RESEND_FROM`, and all 8 IDs before relying on any email flow (verification, magic link, password reset, org invitation, RGPD export/deletion notices).

---

## 7. Sentry (error tracking)

1. Sentry → **Create Organization** in **EU region** (Frankfurt). DSN host = `*.eu.sentry.io`
2. Create 2 projects: `clean-stack-api` (platform: bun) and `clean-stack-app` (platform: react)
3. Copy DSNs into Shared Variables (`SENTRY_DSN` for api, separate `VITE_SENTRY_DSN` for app build args)
4. **Releases**: tied to `GIT_SHA` automatically via `sentry-init.ts` (api) and Vite plugin (app)
5. **Source maps app**: `@sentry/vite-plugin` uploads on build if `VITE_SENTRY_AUTH_TOKEN` is set (optional, post-deploy)

---

## 8. Custom domains + TLS

1. **Service → Networking → Custom Domain**:
   - `api`: `api.<your-domain>` → CNAME points to Railway-provided target
   - `app`: `app.<your-domain>` → CNAME points to Railway-provided target
2. TLS via Let's Encrypt auto (Railway-managed). Wait ~60s for cert issuance.
3. Update `BETTER_AUTH_URL`, `APP_URL`, `CORS_ORIGIN`, `VITE_API_URL` (build arg) accordingly — **redeploy app** (build arg change requires rebuild).

If you skip custom domains: use the `${{RAILWAY_PUBLIC_DOMAIN}}` reference var (auto-resolves to the `*.up.railway.app` URL).

### Domains decide your cookie strategy (this is what makes auth work or silently fail)

The browser holds the BetterAuth session cookie; it's only sent on requests to `api` if the cookie's `SameSite` policy allows it for that request's site.

| Topology | `app` ↔ `api` relation | Cookie policy | Notes |
| --- | --- | --- | --- |
| **Railway domains** (`app-xxx.up.railway.app` + `api-yyy.up.railway.app`) | **Cross-site** (`up.railway.app` is a public suffix) | `SameSite=None; Secure` (already set in prod via `auth.ts`) | Works out of the box. Both must be HTTPS (they are). |
| **Custom, shared parent** (`app.x.com` + `api.x.com`) | Same-site | `SameSite=Lax` is enough and is preferable (less CSRF surface) | Set `BETTER_AUTH_URL`/`APP_URL`/`CORS_ORIGIN`/`VITE_API_URL` to the custom hosts. |
| **Same host, path-split** (`x.com` + `x.com/api` via proxy) | Same-origin | `SameSite=Lax`, no CORS at all | Requires a reverse proxy in front; not the default here. |

Whatever the topology, these four must agree and point at **public** URLs (never `*.railway.internal` — the browser can't resolve the private mesh):
- api `BETTER_AUTH_URL` → the **api** public URL
- api `CORS_ORIGIN` → the **app** public origin (drives both `cors()` and BetterAuth `trustedOrigins`; must be a specific origin, not `*`, because requests are credentialed)
- api `APP_URL` → the **app** public URL (used to build email links)
- app `VITE_API_URL` (**build arg**) → the **api** public URL

`api` and `app` both send `credentials: "include"`; `cors()` replies `Access-Control-Allow-Credentials: true`. Verify with:

```bash
curl -i -X OPTIONS -H "Origin: https://<app-public-url>" -H "Access-Control-Request-Method: GET" https://<api-public-url>/me
# → 204 + access-control-allow-origin: <app-url> + access-control-allow-credentials: true
```

---

## 9. First deploy

Railway's GitHub integration watches the `main` branch by default — push triggers auto-deploy per service, scoped by the `watchPatterns` in each `infra/railway/<service>.toml` (api won't rebuild when only `apps/app/` changes). No deploy webhook / GH Actions plumbing required.

```bash
git push origin dev
```

Open PR `dev → main`, merge as a **merge commit** (NOT squash — release flow requirement). semantic-release tags on `main` → Railway picks up the push → each service rebuilds if its `watchPatterns` matched the diff.

Release tag tracking: `GIT_SHA` and `BUILD_TIME` are auto-injected by Railway via `${{RAILWAY_GIT_COMMIT_SHA}}` and `${{RAILWAY_GIT_COMMIT_MESSAGE}}` reference vars (already wired in §4 per-service Variables). Sentry releases pick up the SHA automatically.

Verify each service:

```bash
curl -i https://api.<your-domain>/livez       # → 200 {"status":"pass","uptimeMs":...}  (minimal by design)
curl -i https://api.<your-domain>/readyz      # → 200, or "warn" if storage unconfigured, or 503 if Postgres down
curl -i https://api.<your-domain>/startupz    # → 200 after boot completes
curl -i https://api.<your-domain>/internal/build-info  # → 401 unsigned (gated); version/sha/runtime live here
curl -i https://app.<your-domain>/health      # → 200 "OK" (Caddy)
curl -i https://app.<your-domain>/            # → 200 index.html
```

**Why `/livez` is bare.** Liveness/startup probes are public and unauthenticated, so they return only `{status, uptimeMs}`. Build metadata (`version`, `commitSha`, `runtime`) is an information-disclosure vector — version fingerprinting for CVE lookup, and for a private clone the commit SHA maps the running binary to exact source. It lives behind `/internal/build-info`, gated by the same signed-HMAC layer as the sweeps (`internalLayers`). Call it with a signed internal request (see `apps/api/src/shared/internal-routes/internal-fetch.ts`). **Never move build info back onto a public probe.**

`/readyz` returning 503 means a *critical* probe failed (e.g. Postgres) — check `railway logs --service api` for the probe name. A `"warn"` status with `storage:s3 fail` is expected and non-critical when R2 isn't configured.

---

## 10. Smoke-test post-deploy

Run through every primary flow. If any step fails, the deploy is **not validated** — fix forward.

1. **Sign-up via UI** → email arrives via Resend → click verification link → land on dashboard
2. **Create organization** → verify `organization` + `member` rows in Postgres (`railway connect Postgres`)
3. **Upload an avatar** → presign → PUT to R2 → confirm → file visible in R2 dashboard at `<userId>/avatar/...`
4. **Trigger RGPD export** (`/settings/account` → Data → Export) → verify:
   - `outbox_event` row with `event_type='user.gdpr.export_requested'`
   - `audit_log` row with `actor_user_id` populated
5. **Force a 500** (e.g. malformed request) → verify Sentry receives the event in the EU project with the right `GIT_SHA` release tag
6. **Cron service** → manually trigger:
   ```bash
   railway run --service cron bun dist/cron/sweep.js
   ```
   Expect 3 lines `[sweep] OK /internal/sweep-webhook-delivery ...` → `... audit-log` → `... outbox`.

---

## 11. Removability — switching providers

Everything Railway-specific is in 3 places:
- `infra/railway/*.toml`
- `docs/DEPLOY-RAILWAY.md` (this file)
- Per-service Variables (in Railway dashboard, not the repo)

The Dockerfiles (`apps/api/prod.Dockerfile`, `apps/app/prod.Dockerfile`) are portable. The Caddyfile is portable. The cron entrypoint (`apps/api/src/cron/sweep.ts`) is HTTP-only.

### → Fly.io

```toml
# infra/fly/api.fly.toml
app = "clean-stack-api"
primary_region = "ams"

[build]
dockerfile = "apps/api/prod.Dockerfile"

[[services]]
internal_port = 3000
protocol = "tcp"

[[services.http_checks]]
path = "/livez"
interval = "30s"
timeout = "5s"
```

Cron: Fly Machines via scheduled launch (`fly machine run --schedule daily`), startCommand = `bun dist/cron/sweep.js`.

### → Render

Render Blueprint (`render.yaml`) at repo root with `services:` for api/app/cron. Same Dockerfile paths. Cron: native Cron Job service.

### → Google Cloud Run

`gcloud run deploy api --source apps/api --region europe-west4 --port 3000`. Cron via Cloud Scheduler + Cloud Run job invoking `bun dist/cron/sweep.js`.

Each switch keeps the Dockerfiles, the `apps/api/src/cron/sweep.ts` entrypoint, and the env baseline unchanged. Only the orchestration config changes.

---

## 12. Troubleshooting

| Symptom                                          | Likely cause                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| `/livez` returns 200 but service shows "Crashed" | Railway `healthcheckPath` mismatch — verify it's `/livez` (api) / `/health` (app) in `infra/railway/<svc>.toml` |
| Build fails: `Cannot find module '@packages/...'` | Root directory not set to `/` — Docker build context excludes `packages/`   |
| `Dockerfile not found`                           | `dockerfilePath` is relative to repo root, not service root — keep as `apps/api/prod.Dockerfile` |
| `BETTER_AUTH_SECRET min length 32`               | Empty or short — generate with `openssl rand -base64 32`                      |
| `INTERNAL_AUTH_LAYERS must include "signature"`  | env-driven check at boot (`apps/api/src/shared/env.ts`) — set it             |
| Sentry events missing                            | DSN typo; check `${{shared.SENTRY_DSN}}` resolved (Railway logs at boot)      |
| Cron service runs forever                        | `restartPolicyType = "NEVER"` missing in `infra/railway/cron.toml`            |
| `app` shows blank page after deploy              | `VITE_API_URL` build arg missing/wrong → bundle has `undefined` or fails `z.url()` parse → fetch fails. Must be a full **public** URL (`https://…`), never `*.railway.internal`. Rebuild. |
| R2 returns 403 on presigned URL                  | API token scope too narrow — must include Object Write + Read for the bucket  |
| `app` deploy **FAILED with no logs** ("Stopping Container", phantom crash) | A Railway **Start Command** override is set on `app` and replaces the Caddy CMD; the Caddy image has no Node/pnpm → instant exit. Clear Settings → Deploy → Start Command. See §0. |
| api boot crash: `unable to determine transport target for "pino-pretty"` | `NODE_ENV=development` service var overriding the Dockerfile → logger loads a devDep absent in `--prod`. Set `NODE_ENV=production` (or unset it). See §0. |
| api boot crash: `Cannot find module 'better-auth/...'` (from a `@packages/*`) | A workspace package imports a third-party lib in its **runtime** source but declares it only as `peerDependencies`/`devDependencies` → not installed by `pnpm install --prod`. Declare it under `dependencies`. |
| Login succeeds then session is lost on next request / redirect | Cross-site cookie not sent: `app` and `api` are different sites (Railway domains) but the cookie isn't `SameSite=None; Secure`. Verify `auth.ts` cookie policy + that you're on HTTPS. See §0/§8. |
| `/internal/build-info` shows `"unknown"` | Deployed via `railway up` (no `RAILWAY_GIT_*`), or `GIT_SHA`/`BUILD_TIME` vars unset. Resolves on a branch deploy. |
| Changing a variable redeploys old/broken code   | A var change rebuilds from the connected **branch** (`main`), not from your last `railway up`. Land the fix on `main` first. |

Run `railway logs --service <name>` for live tail. `railway run --service <name> <cmd>` to execute one-off commands in the service env.
