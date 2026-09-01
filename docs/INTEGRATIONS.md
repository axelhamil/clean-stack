# Integrations

The boilerplate ships the **wiring** — endpoints, ports, env-validated secrets,
hooks. To run at full potential, a few things must be configured **outside the
codebase**: Resend templates, a scheduler, a storage bucket, DNS records.

This document is the punch list. Walk it top-to-bottom before going live.

For per-feature internals, see [`FEATURES.md`](./FEATURES.md). For the rationale
behind each choice, see [`HISTORY.md`](./HISTORY.md). For cron wiring details,
see [`CRON.md`](./CRON.md).

---

## 1. Resend — email delivery queue + templates

**Phase D.5 changed the delivery model.** `IEmailService` (`QueuedEmailService`) no longer calls Resend directly — every send enqueues one or more rows in the `email_message` table (inside the caller's transaction when `options.tx` is passed). `EmailDeliveryWorker` polls every 2 s, claims up to 300 pending rows (`FOR UPDATE SKIP LOCKED`, 120 s claim window), groups by `(kind, template)`, chunks to 100, and sends each chunk via `resend.batch.send`. Batch cap is 100 emails/request against a **10 req/s per team** Resend ceiling. This makes fan-out (RGPD wipe sweep, org announcements, D.3 digests) safe under the rate limit: N recipients → ⌈N/100⌉ HTTP calls, not N.

### Template rendering (Phase D.5 — in-repo React Email)

`@packages/emails` ships one React Email component + `subject()` per template key. Templates render server-side at enqueue time — no Resend dashboard required on a fresh clone.

`TEMPLATE_IDS` in `apps/api/src/shared/services/email-delivery-worker.service.ts` is now an **override map**: an empty string means render the in-repo template; a non-empty string means use that Resend dashboard template ID instead. A fresh clone therefore sends real emails with zero dashboard setup.

### Template inventory

| Key in `TEMPLATE_IDS` | Used for | Variables |
|---|---|---|
| `verify_email` | Email confirmation on sign-up | `name`, `verifyUrl` |
| `reset_password` | Forgot-password flow | `name`, `resetUrl` |
| `magic_link` | Passwordless sign-in | `magicUrl` |
| `org_invitation` | Inviting a member to an organization | `inviterName`, `orgName`, `role`, `inviteUrl` |
| `data_export_ready` | RGPD data export ready | `name`, `downloadUrl`, `expiresAt` |
| `delete_requested` | Account-deletion grace started | `name`, `cancelUrl`, `expiresAt` |
| `delete_cancelled` | User cancelled deletion in time | `name` |
| `delete_completed` | Account anonymized after grace | `name` |
| `change_email` | Email address change confirmation | `name`, `confirmUrl` |
| `backup_code_used` | Backup MFA code consumption alert | `name`, `email` |
| `api_token_leaked` | Notifies owner when GitHub Secret Scanning reports a token match | `name`, `tokenName`, `revokedAt` |

### Authoring rules

- **Variable names are case-sensitive** and must match the table above
  exactly. The single source of truth is `EmailTemplates` in
  `apps/api/src/shared/ports/email.port.ts`.
- **All URLs** point at `APP_URL` (the front), never the API. The server hooks
  build them; the front consumes the token.
- **Brand the visible label**, never embed the raw URL — Outlook/Gmail
  re-autolink visible URL text and break `?token=...`.
- **`expiresAt` is an ISO string** (`new Date(...).toISOString()`); render it
  with the user's locale on the template side.
- **Locale is per recipient, never per batch** — `EmailRecipient<K>.locale`
  (`apps/api/src/shared/ports/email.port.ts`), resolved at enqueue and frozen
  onto the `email_message.locale` column, so a retry days later replays the
  same language. There is deliberately no batch-level `locale` option: the two
  genuinely multi-recipient callers (notification digests, RGPD notices) are
  exactly the ones that must not be forced into one language.
- **Never call Resend directly from a request path** — always go through `IEmailService.sendTemplate` or `sendTemplateBatch`. The worker owns batching and retry.

### Bounce suppression

Hard bounces are filtered **provider-side and automatically** — Resend's domain-scoped suppression list blocks future sends to bounced addresses with a 422 + `email.suppressed` webhook event. No local `email_suppression` table is needed (build one only when a product feature consumes it).

### Idempotency

`Idempotency-Key` is **per batch request** (not per recipient). The worker derives a key from the chunk's claim window; callers can pass `options.idempotencyKey` which the queue service fans out as `${key}/${index}` per recipient.

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
| `POST /internal/rgpd-sweep` | Daily, e.g. `0 3 * * *` UTC | Wipes accounts whose 7-day grace window has elapsed. Idempotent — safe to over-schedule. |
| `POST /internal/flush-notification-emails` | Every minute | Groups notification emails that have come due into per-user/category digests and enqueues them. This cadence is what `immediate` means for email; true real-time is the SSE stream's job. `hourly` / `daily` rows come due on wall-clock anchors stamped at fan-out — see `docs/CRON.md` § Digest windows. |
| `POST /internal/sweep-notifications` | Daily | Purges **read** notifications past `NOTIFICATION_RETENTION_DAYS`. Unread rows are never purged, whatever their age. |
| `POST /internal/sweep-email-messages` | Daily | Purges `sent` rows past `EMAIL_MESSAGE_RETENTION_DAYS` (default 7d, from `sent_at`) and `failed` rows past `EMAIL_MESSAGE_FAILED_RETENTION_DAYS` (default 90d, from `created_at`). |
| `POST /internal/sweep-{webhook-delivery,audit-log,outbox}` | Daily, **in this order** | Retention purge of the event pipeline tables. The order is not cosmetic: `ON DELETE RESTRICT` foreign keys make the reverse order fail. |

Only the first row is strictly required to be compliant; the rest keep tables from growing without bound. Full request/response contracts in [`CRON.md`](./CRON.md).

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

1. Add an internal endpoint under `apps/api/src/modules/<context>/routes.ts (internal sub-app)`.
2. Document it in [`CRON.md`](./CRON.md) and in the table above.
3. Wire it in your chosen scheduler.

Keep payloads small (`{}` or a tiny config object) — the work happens
server-side, the scheduler is just a trigger.

---

## 3. Storage — S3-compatible bucket

Dev uses SeaweedFS (opt-in via Docker Compose profile `storage` —
`docker compose --profile storage up -d`; bucket auto-created by `seaweedfs-init`).
Host port is pinned to `8333`; inside the compose network it's reachable as
`seaweedfs:8333`. Production uses any S3-compatible provider. Cloudflare R2 is the recommended default (zero egress
fees, S3 API compatibility verified for the patterns this stack uses — see
`HISTORY.md` for the verified-2026 list).

> **Why SeaweedFS over MinIO?** MinIO was archived in April 2026 (maintenance
> mode + features moved behind enterprise license). SeaweedFS is Apache 2.0,
> ~96 MB image, single-process in dev (`weed server -s3`), full S3 compat
> (presigned URLs, multipart). Same SDK, zero code change.

### Provisioning checklist (production)

- **Create the bucket** in the chosen region/jurisdiction. Once created, R2
  buckets typically can't be moved between jurisdictions — pick the right one
  for your user base (EU for RGPD-only customers).
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
credentials are the dev defaults (`dev`/`dev`).

### Optional follow-ups (not yet shipped)

- **Orphan GC cron** — sweep storage objects with no DB row referencing the
  key. Deferred until the first business table stores keys (rule 14).
- **Lifecycle rules on the bucket** — archive `<userId>/exports/` to cold
  storage after 7 days (the export presigned URL TTL), or delete after 30 days
  if you don't want long-term retention.

---

## 4. Stripe — subscriptions + webhooks

The billing module uses `@better-auth/stripe`. The plugin owns the webhook endpoint (`POST /api/auth/stripe/webhook`) and the `subscription` table. Configuration is minimal — no price IDs in env; prices live in Stripe.

### Stripe setup checklist

1. **Create a Stripe account** and enable billing features (Stripe Dashboard → Settings → Billing).
2. **Create Products and Prices** for each paid plan. Each paid Product *must* carry `metadata.tier = <your-tier-key>` — this is the join key to the `ENTITLEMENTS` map in `apps/api/src/modules/billing/config.ts`. Set `marketing_features` on each Product for the pricing-page bullet list.
3. **Add a webhook endpoint** in the Stripe Dashboard pointing at `https://<your-api-domain>/api/auth/stripe/webhook`. Subscribe to at minimum: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
4. **Copy the webhook signing secret** (starts with `whsec_`) into `STRIPE_WEBHOOK_SECRET`.

### Entitlements contract (`apps/api/src/modules/billing/config.ts`)

Each entry in `ENTITLEMENTS` must have a key matching a `metadata.tier` value on a Stripe Product:

```ts
// pattern — not the actual file; adapt to your plan names
export const ENTITLEMENTS: Record<string, { rank: number; maxMembers: number | null; features: string[]; quotas: Record<string, number | null> }> = {
  free:  { rank: 0, maxMembers: 3,    features: [],                     quotas: { uploads: 10,  projects: 3 } },
  pro:   { rank: 1, maxMembers: null, features: ["advanced-analytics"], quotas: { uploads: null, projects: null } },
};
```

- `maxMembers: null` = unlimited seats (JSON-safe).
- `features` = string flags checked by `requireFeature(flag)` / `<FeatureGate flag>`.
- `rank` = integer used by `requirePlan(minTier)` to compare tiers ordinally.
- `quotas` (Phase B.2) = per-resource numeric caps (`null` = unlimited), enforced by `requireQuota(key, readUsage)` / `reserveQuota` and surfaced front-side via `useQuota(key, used)` / `<QuotaGate>`. Dormant skeleton — see [`QUOTA-GATING.md`](QUOTA-GATING.md) for how to wire a quota to a resource.

The free tier (`rank: 0`) is always available, even when Stripe is unconfigured — the catalog degrades to free-only and the app boots normally.

### Env vars

```
STRIPE_SECRET_KEY=sk_live_...        # Required for Checkout/Portal/webhooks; omit → free-only mode
STRIPE_WEBHOOK_SECRET=whsec_...      # Required when STRIPE_SECRET_KEY is set; signs webhook payloads
```

No `STRIPE_PRICE_*` variables — prices live in the Stripe dashboard, fetched at runtime by `CatalogService`.

### Hosted flows (no custom UI needed)

- **Upgrade** → `POST /billing/checkout` redirects to Stripe Checkout (hosted, Stripe-managed).
- **Manage / cancel / change payment method** → `POST /billing/portal` (gated `billing:manage`, owner only) redirects to the Stripe Billing Portal (hosted).

### RGPD: Stripe customer cleanup on account deletion

`RgpdService.executeAccountWipe` calls Stripe to delete the customer object during the wipe sequence. Failure is captured and logged (non-fatal) — account deletion must never be blocked by a Stripe API error.

---

## 5. Production secrets — checklist

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

### RGPD knobs (defaults work)

- `RGPD_GRACE_PERIOD_DAYS` (default `7`)
- `RGPD_EXPORT_RATE_LIMIT_HOURS` (default `24`)
- `RGPD_SWEEP_BATCH_SIZE` (default `50`)

### API tokens (required when the public API surface is active)

- `API_TOKEN_PEPPER` (min 32, `openssl rand -hex 32`) — server-side HMAC pepper. Required in production; a missing or weak pepper means a database dump yields usable tokens.
- `API_TOKEN_PREFIX` — prefix for all generated tokens (default `clean_`). **Set a unique value per product** (e.g. `myapp_`) so GitHub Secret Scanning can distinguish your tokens from other boilerplate clones.
- `API_TOKEN_PEPPER_PREVIOUS` + `API_TOKEN_PEPPER_VERSION` — optional; needed only during pepper rotation (leave unset otherwise).

### Billing (required when Stripe is configured)

- `STRIPE_SECRET_KEY` — Stripe secret key (`sk_live_...` or `sk_test_...`). Omit → free-only catalog, no Checkout/Portal.
- `STRIPE_WEBHOOK_SECRET` — webhook signing secret (`whsec_...`). Required when `STRIPE_SECRET_KEY` is set. See §4.

### Optional

- `RESEND_FROM` — defaults to `onboarding@resend.dev`; switch to your
  authenticated domain once DNS is green.

The full schema lives in `apps/api/common/env.ts`. `.env.example` at the API
root is the up-to-date template.

---

## 6. Database

- **First-time provisioning**: `pnpm db:push` (dev) or `pnpm db:generate &&
  pnpm db:migrate` (prod-style — ship migrations as artifacts). `db:push` runs
  `drizzle-kit push --force` because it executes under Turbo's non-TTY pipe;
  drizzle-kit's interactive data-loss prompt would otherwise hang. Safe in dev
  (push is dev-only); prod uses `db:migrate` which doesn't prompt.
- **Backups**: configured at the managed-Postgres level. Test restore
  procedure before going live — a backup you can't restore is not a backup.
- **Pool sizing**: defaults match Bun's connection pooling; tune
  `DATABASE_URL` query params (`?max=10`) only after measuring contention.

---

## 7. Optional follow-ups

These aren't blockers for launch but pay off quickly:

- **Uptime monitoring**: external probe on `GET /readyz` (returns 200 once DB
  reachable). `/livez` is the liveness counterpart (no external deps).

---

## 8. GitHub Secret Scanning — token leak protection

GitHub scans every public repository for secrets. If a token matching your
prefix appears in a commit or file, GitHub calls your registered webhook
endpoint; the boilerplate handles the rest: ECDSA P-256 signature
verification, token revocation in the same transaction, and an email to the
owner (via the `api_token_leaked` Resend template).

**What the boilerplate ships**: the receiving endpoint `POST /api/token-scanning/github`
in `apps/api/src/modules/api-token/scanning.routes.ts`, ready to deploy. The
endpoint verifies the `GITHUB-PUBLIC-KEY-SIGNATURE` + `GITHUB-PUBLIC-KEY-IDENTIFIER`
headers against GitHub's live public keys (`https://api.github.com/meta/public_keys/secret_scanning`),
revokes the matched token, and sends the owner an email. No extra env var is
required on the receiving side.

**What each clone must do** — GitHub's Secret Scanning Partner Program requires a
publicly accessible HTTPS endpoint and a GitHub review of the integration:

1. **Set your token prefix** — `API_TOKEN_PREFIX` (default `clean_`, but every
   production clone needs a distinct prefix so GitHub's regex uniquely
   identifies your tokens). Choose something like `myapp_` and set it in
   `.env.example` before shipping.

2. **Deploy the endpoint** — `POST https://<your-api-domain>/api/token-scanning/github`
   must be reachable from GitHub's IP ranges (no auth beyond the ECDSA
   signature the boilerplate already verifies).

3. **Register with GitHub** — follow the [Partner Program enrolment](https://docs.github.com/en/developers/overview/secret-scanning-partner-program):
   - Go to **github.com → Settings → Developer settings → Secret scanning**.
   - Provide: the HTTPS endpoint URL, a regex that matches your prefix
     (e.g. `clean_[1-9A-HJ-NP-Za-km-z]{44}[1-9A-HJ-NP-Za-km-z]{6}`), and a
     test token payload.
   - GitHub reviews and enables your pattern; once live, any public repo push
     that contains a matching token triggers your webhook within minutes.

4. **Verify the integration** — GitHub sends a test payload after enabling the
   pattern. Check that the endpoint returns `200` and that the test token
   appears in the `api_token` table with `revokedReason = 'leaked'`.

> **Note**: the Partner Program is for public SaaS products. If your clone is
> an internal tool or a private deployment, skip this step — GitHub will only
> scan *public* repositories for your prefix.

---

## TL;DR — pre-production checklist

- [ ] 9 Resend templates created with exact variable names; IDs filled in
      `TEMPLATE_IDS` in `apps/api/src/shared/services/email.service.ts`
- [ ] DNS records for sending domain (SPF, DKIM, DMARC) — green in Resend
- [ ] S3 bucket provisioned, scoped credentials, CORS configured
- [ ] Stripe Products created with `metadata.tier` set; `ENTITLEMENTS` in
      `apps/api/src/modules/billing/config.ts` matches every tier key
- [ ] Stripe webhook endpoint registered for the 4 required event types;
      `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` set (or omit both for free-only)
- [ ] `INTERNAL_SIGNING_KEY` generated (≥32 chars); `INTERNAL_AUTH_LAYERS`
      set per infra (`signature` everywhere, add `private-network` on Railway/Fly)
- [ ] `BETTER_AUTH_SECRET` generated (≥32 chars)
- [ ] `API_TOKEN_PEPPER` generated (`openssl rand -hex 32`); `API_TOKEN_PREFIX` set to your app's unique prefix (not `clean_`)
- [ ] All env vars set per §5
- [ ] Cron service chosen and wired to `/internal/rgpd-sweep` (daily)
- [ ] DB migrations applied; backups verified
- [ ] GitHub Secret Scanning enrolment submitted (see §8) — skip for private/internal deployments
- [ ] `pnpm ci:check` green; smoke test on staging (signup → invite → upload →
      export → request deletion → cancel → expire grace → sweep → billing checkout)
