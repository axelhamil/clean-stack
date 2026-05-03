# Integrations

The boilerplate ships the **wiring** — endpoints, ports, env-validated secrets,
hooks. To run at full potential, a few things must be configured **outside the
codebase**: Resend templates, a scheduler, a storage bucket, DNS records.

This document is the punch list. Walk it top-to-bottom before going live.

For per-feature internals, see [`FEATURES.md`](./FEATURES.md). For the rationale
behind each choice, see [`HISTORY.md`](./HISTORY.md). For cron wiring details,
see [`CRON.md`](./CRON.md).

---

## 1. Resend — email templates

Resend templates are managed **in the dashboard**, not in code. The API only
references them by ID. Each template must exist with the exact variables the
codebase passes — Resend returns a 422 on mismatch.

Template IDs live in a single hashmap at the top of
`apps/api/src/adapters/services/email.service.ts` (`TEMPLATE_IDS`). Edit it
once when cloning. They aren't secrets — just opaque dashboard handles — so
keeping them in code is simpler than 8 env vars.

### Template inventory

| Key in `TEMPLATE_IDS` | Used for | Variables |
|---|---|---|
| `verify_email` | Email confirmation on sign-up | `name`, `verifyUrl` |
| `reset_password` | Forgot-password flow | `name`, `resetUrl` |
| `magic_link` | Passwordless sign-in | `magicUrl` |
| `org_invitation` | Inviting a member to an organization | `inviterName`, `orgName`, `role`, `inviteUrl` |
| `data_export_ready` | GDPR data export ready | `name`, `downloadUrl`, `expiresAt` |
| `delete_requested` | Account-deletion grace started | `name`, `cancelUrl`, `expiresAt` |
| `delete_cancelled` | User cancelled deletion in time | `name` |
| `delete_completed` | Account anonymized after grace | `name` |

### Authoring rules

- **Variable names are case-sensitive** and must match the table above
  exactly. The single source of truth is `EmailTemplates` in
  `apps/api/src/application/ports/email.port.ts`.
- **All URLs** point at `APP_URL` (the front), never the API. The server hooks
  build them; the front consumes the token.
- **Brand the visible label**, never embed the raw URL — Outlook/Gmail
  re-autolink visible URL text and break `?token=...`.
- **`expiresAt` is an ISO string** (`new Date(...).toISOString()`); render it
  with the user's locale on the template side.
- Boot fails hard in production if `RESEND_API_KEY` is missing or any
  `TEMPLATE_IDS` entry is empty — see `ResendEmailService` constructor.

### DNS hardening (mandatory before sending in production)

Gmail / Yahoo / Outlook reject unauthenticated bulk senders since 2024-2025.
Three records to add on the sending domain:

- **SPF** — TXT record published by Resend (one-line `v=spf1 include:...`).
- **DKIM** — three CNAMEs from the Resend dashboard.
- **DMARC** — TXT `_dmarc.<domain>` with at minimum `v=DMARC1; p=none;
  rua=mailto:dmarc@<domain>`. Tighten to `p=quarantine` or `p=reject` once
  reports are clean.

Resend's dashboard verifies all three — don't ship without the green check.

---

## 2. Scheduler — cron jobs

The boilerplate stays **scheduler-agnostic**. It exposes protected internal
endpoints; you wire your own scheduler.

### Jobs to wire

| Endpoint | Recommended cadence | Purpose |
|---|---|---|
| `POST /internal/gdpr-sweep` | Daily, e.g. `0 3 * * *` UTC | Wipes accounts whose 7-day grace window has elapsed. Idempotent — safe to over-schedule. |

All `/internal/*` endpoints are protected by HMAC-signed requests
(`X-Internal-Signature: t=<unix>,v1=<hex>` over a canonical message — see
[`CRON.md`](./CRON.md)). The signing key never travels on the wire. On
infra with a private mesh (Railway, Fly), stack `private-network` on top
via `INTERNAL_AUTH_LAYERS=signature,private-network`.

### Choose one scheduler

Implementation snippets for each option (GitHub Actions, Vercel Cron, Railway,
K8s CronJob, Inngest, BullMQ) are in [`CRON.md`](./CRON.md). Pick by infra:

- **Serverless / managed PaaS** → Vercel Cron or Railway Cron (zero infra).
- **GitHub-only ops** → GitHub Actions cron (free, no extra service).
- **Kubernetes** → CronJob (native, observable via `kubectl`).
- **Already running a queue** → Inngest or BullMQ (reuse infra, retries built-in).

### When to add a job

Each new business job follows the same pattern:

1. Add an internal endpoint under `apps/api/src/routes/internal.routes.ts`.
2. Document it in [`CRON.md`](./CRON.md) and in the table above.
3. Wire it in your chosen scheduler.

Keep payloads small (`{}` or a tiny config object) — the work happens
server-side, the scheduler is just a trigger.

---

## 3. Storage — S3-compatible bucket

Dev uses MinIO (`docker compose up -d` — auto-created). Production uses any
S3-compatible provider. Cloudflare R2 is the recommended default (zero egress
fees, S3 API compatibility verified for the patterns this stack uses — see
`HISTORY.md` for the verified-2026 list).

### Provisioning checklist (production)

- **Create the bucket** in the chosen region/jurisdiction. Once created, R2
  buckets typically can't be moved between jurisdictions — pick the right one
  for your user base (EU for GDPR-only customers).
- **Generate API credentials** scoped to the bucket (least-privilege: read +
  write + delete + list, no admin).
- **Disable public access** on the bucket. Public reads happen via
  presigned-GET (`presignDownload`), not public objects.
- **CORS policy**: allow the front origin (`APP_URL`) for `PUT`, `GET`, `HEAD`
  with the headers the SDK signs (`Content-Type`, `Content-Length`).
- **Set the env vars**:
  - `S3_ENDPOINT`, `S3_REGION` (`auto` for R2), `S3_BUCKET`
  - `S3_ACCESS_KEY`, `S3_SECRET_KEY`
  - `S3_FORCE_PATH_STYLE=true`
  - `S3_PUBLIC_URL` — base URL prefix for public asset reads (only used when
    the object is intentionally public).

Boot fails hard if `NODE_ENV=production` and the endpoint is `localhost` or
credentials are the MinIO defaults.

### Optional follow-ups (not yet shipped)

- **Orphan GC cron** — sweep storage objects with no DB row referencing the
  key. Deferred until the first business table stores keys (rule 14).
- **Lifecycle rules on the bucket** — archive `<userId>/exports/` to cold
  storage after 7 days (the export presigned URL TTL), or delete after 30 days
  if you don't want long-term retention.

---

## 4. Production secrets — checklist

Every secret below must be set in production. Boot validates via Zod and fails
fast on missing/invalid values.

### Required

- `DATABASE_URL` — Postgres connection string (managed Postgres recommended).
- `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` (min 32, generate with `openssl rand
  -base64 32`).
- `APP_URL` — front origin used in every email URL.
- `CORS_ORIGIN` — comma-separated allow-list for the API.
- `INTERNAL_SIGNING_KEY` (min 32, `openssl rand -hex 32`) — HMAC key for
  `/internal/*` request signing. Never sent on the wire.
- `INTERNAL_AUTH_LAYERS` — `signature` (default) or `signature,private-network`
  on Railway/Fly for defense-in-depth.
- `RESEND_API_KEY`. Template IDs live in `TEMPLATE_IDS` in code (see §1), not env.
- `S3_*` env vars (see §3).

### GDPR knobs (defaults work)

- `GDPR_GRACE_PERIOD_DAYS` (default `7`)
- `GDPR_EXPORT_RATE_LIMIT_HOURS` (default `24`)
- `GDPR_SWEEP_BATCH_SIZE` (default `50`)

### Optional

- `RESEND_FROM` — defaults to `onboarding@resend.dev`; switch to your
  authenticated domain once DNS is green.

The full schema lives in `apps/api/common/env.ts`. `.env.example` at the API
root is the up-to-date template.

---

## 5. Database

- **First-time provisioning**: `pnpm db:push` (dev) or `pnpm db:generate &&
  pnpm db:migrate` (prod-style — ship migrations as artifacts).
- **Backups**: configured at the managed-Postgres level. Test restore
  procedure before going live — a backup you can't restore is not a backup.
- **Pool sizing**: defaults match Bun's connection pooling; tune
  `DATABASE_URL` query params (`?max=10`) only after measuring contention.

---

## 6. Optional follow-ups

These aren't blockers for launch but pay off quickly:

- **Error tracking**: pipe `pino` errors to Sentry / Axiom / Better Stack.
  The stack already emits structured JSON with `requestId`.
- **Uptime monitoring**: external probe on `GET /ready` (returns 200 once DB
  reachable).
- **Audit log**: TODO comments in the GDPR use-cases mark the four transition
  points (`data.export.requested`, `user.delete.{requested,cancelled,completed}`)
  for when the audit-log feature lands.
- **Stripe customer deletion**: TODO comment in `execute-account-wipe` marks
  the hook point for when `@better-auth/stripe` is wired.

---

## TL;DR — pre-production checklist

- [ ] 8 Resend templates created with exact variable names; IDs filled in
      `TEMPLATE_IDS` in `apps/api/src/adapters/services/email.service.ts`
- [ ] DNS records for sending domain (SPF, DKIM, DMARC) — green in Resend
- [ ] S3 bucket provisioned, scoped credentials, CORS configured
- [ ] `INTERNAL_SIGNING_KEY` generated (≥32 chars); `INTERNAL_AUTH_LAYERS`
      set per infra (`signature` everywhere, add `private-network` on Railway/Fly)
- [ ] `BETTER_AUTH_SECRET` generated (≥32 chars)
- [ ] All env vars set per §4
- [ ] Cron service chosen and wired to `/internal/gdpr-sweep` (daily)
- [ ] DB migrations applied; backups verified
- [ ] `pnpm ci:check` green; smoke test on staging (signup → invite → upload →
      export → request deletion → cancel → expire grace → sweep)
