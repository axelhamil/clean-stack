# ROADMAP

Forward-looking work for clean-stack. **All SOTA 2026, outside DDD** (DDD reserved for pure business domain). Already-shipped work is logged in [`docs/HISTORY.md`](docs/HISTORY.md) ; current inventory in [`docs/FEATURES.md`](docs/FEATURES.md).

> **Boilerplate target**: clone → ship any SaaS without re-coding plumbing. Anything below that isn't `[x]` is friction the cloner inherits.

---

## ✅ Already shipped (key milestones)

| Milestone | When | Surface |
|---|---|---|
| Auth (BetterAuth) | — | sign-in/up, MFA, passkey, magic-link, bearer, customSession, email hooks idempotents |
| Multi-tenant + access-control SSOT | — | organization plugin, Personal org self-heal, capability-based predicate front+back, `<Can>` |
| Email (Resend port + adapter) | — | template registry typed, idempotency, retry, EU region option |
| Storage S3-compatible (R2/SeaweedFS) | — | three-step presign→PUT→confirm, owner-scoped key, server-verified `HeadObject` |
| RGPD core (Art. 17 + Art. 20) | — | 7-day grace, 2FA-gated, sole-owner preflight, cron sweep, `/legal/data-rights` |
| App shell + ⌘K palette | — | top-nav, contextual settings tabs, view-transitions theme, command palette |
| Vertical-slice layout (front + back) | — | features/<x>/<x>.{route,page}.tsx + modules/<x>/{application,infrastructure,routes,module}.ts |
| Clone-ability bootstrap (`pnpm bootstrap` + Docker compose v2 + Linux fixes + source-only packages) | May 2026 | `pnpm bootstrap` script, SeaweedFS profile `storage`, db:push --force, internal packages source-only |
| **Event-driven foundation** | **May 2026** | outbox + LISTEN/NOTIFY dispatcher + 29 events emitted automatically (21 BetterAuth bridge + 5 RGPD + 3 uploads) + audit-log API + webhooks API + worker (HMAC + AEAD + decorrelated jitter retry). See dedicated section below + [`docs/EVENTS.md`](docs/EVENTS.md) (DX guide) + [`docs/EVENT_PIPELINE.md`](docs/EVENT_PIPELINE.md) (visual walkthrough). |

---

## 🚧 Priority — read top-to-bottom

Each phase assumes the previous done. Items inside a phase parallelizable. Order: (1) blocking deps, (2) SOTA-2026 non-negotiables (RGPD/EAA/Google-Yahoo email/NIST 800-63B-4/DORA) clustered upfront for EU+US deployability, (3) ops surfaces before customer-facing.

### Phase 0 — Foundation closeout (blocks Phase B)

| # | Item | Status |
|---|---|---|
| 0.0 | Clone-ability bootstrap | **5/7 done** — remaining: CI smoke test + `docs/QUICKSTART.md` |
| 0.1 | DB schema split per context (currently `auth.ts` bundles auth + multi-tenant + RGPD) | TODO — before Billing |
| 0.2 | Health probes `/livez` + `/readyz` + `/startupz` (K8s 2026, IETF `draft-inadarei`, registry pattern) | TODO — graceful shutdown wired to `/readyz` for zero-downtime deploys |
| 0.3 | Backups `pg_dump` + restore tested (3-2-1 rule, 30d retention, monthly automated restore-test) | TODO — RPO/RTO in `docs/DISASTER-RECOVERY.md` |
| 0.4 | Sentry + OpenTelemetry + Prometheus `/metrics` (3 detachable ports + NoOp default) | TODO — subscribers now trivial via `onEvent` (event-driven foundation) |
| 0.5 | Removability dry-run on `rgpd` (first leaf removed end-to-end, validates contract) | TODO |
| 0.6 | Retention sweeps (`outbox_event` / `audit_log` / `webhook_delivery`) | TODO — see expanded scope below |

#### 0.6 — Retention sweeps (cleanup the event-driven foundation)

**Why**: the event-driven foundation creates rows in three tables that grow unboundedly today. `outbox_event` accumulates every dispatched event forever (the row has zero downstream value once `dispatched_at IS NOT NULL` — audit/webhook are independent durables). `audit_log` has a `retention` column wired at INSERT (`retentionFor(eventType)`) but no consumer purges according to it — a SOC2 auditor will flag rows older than their declared retention policy. `webhook_delivery` keeps every `success`/`dead_letter` row indefinitely. Symptom in prod after 12 months: `pg_dump` size dominated by transient pipeline rows, slow `count(*)` analytics, retention policy declared but not enforced (compliance risk).

**Pattern**: reuse the `rgpd.service.processPendingDeletions` shape — internal route gated by `internalLayers` (HMAC), callable from any external cron (Vercel Cron / GitHub Actions / Inngest). One route per sweep, idempotent, dry-run friendly.

- [ ] **`POST /internal/sweep-outbox`** — `DELETE FROM outbox_event WHERE dispatched_at IS NOT NULL AND dispatched_at < now() - interval '<OUTBOX_RETENTION_DAYS>'` (default 7 days, env-configurable). Batch with `LIMIT` to avoid long-running TX. Logs `{ deleted: N }`. Trigger: hourly.
- [ ] **`POST /internal/sweep-audit-log`** — per-retention enforcement. For each `retention` value in the catalog (`30d`, `1y`, `7y`, `none`), `DELETE FROM audit_log WHERE retention = '<X>' AND occurred_at < now() - <duration>`. Rows with `retention = 'none'` purged aggressively (e.g. 7d operational window). Batched, idempotent. Trigger: daily.
- [ ] **`POST /internal/sweep-webhook-delivery`** — `DELETE FROM webhook_delivery WHERE status IN ('success','dead_letter') AND created_at < now() - interval '<WEBHOOK_DELIVERY_RETENTION_DAYS>'` (default 30 days). Pending/failed rows kept for retry. Trigger: daily.
- [ ] **Env knobs**: `OUTBOX_RETENTION_DAYS=7`, `WEBHOOK_DELIVERY_RETENTION_DAYS=30`, `AUDIT_LOG_NONE_RETENTION_DAYS=7` — defaults sane, all overridable per deployment.
- [ ] **Docs**: `docs/EVENTS.md` § Retention — explain who consumes which column (`retention` in audit_log → audit sweep; nothing in outbox → uniform global sweep) + the cron registration recipe.
- [ ] **Optional dry-run mode**: `?dryRun=true` returns the rowcount that *would* be deleted, no mutation. Reuses the existing RGPD pattern.

**Decisor "global vs per-row retention"**: outbox uses a **uniform global policy** (every dispatched row is jetable after the same window — debug window only); audit_log uses **per-row policy** via the column (compliance demands differ per event type). Don't generalize one shape onto the other.

**Estimation**: ~3 hours (3 routes ~30 LOC each + 1 cron config + 1 doc paragraph). Unblocks: SOC2/ISO27001 deployment readiness, predictable storage growth, `pg_dump` size control (relates to Phase 0.3 backups).

### Phase A — Legal + accessibility completeness

> RGPD core shipped. Below = closure of EU-deployability surface (RGPD + EAA + ePrivacy + NIS2/DORA contractual). **Filed away after Phase A** — nothing later revisits legal.

- **A.1** Right to rectification UI (Art. 16) + NIST 800-63B-4 password (15 chars min / 8 with MFA, HIBP screening, ban complexity rules)
- **A.2** Privacy policy / Terms versioning (Art. 7) — foundation for A.4 + A.5
- **A.3** Compliance docs bundle — `/legal/sub-processors` (Art. 28) + `/legal/accessibility` (EAA Art. 14) + DPA + DORA annex templates
- **A.4** Cookie consent + Consent management — first real Aggregate consumer of `@packages/ddd-kit`. CNIL/EDPB-conform.
- **A.5** Privacy dashboard `/settings/privacy` — UX hub aggregating A.2/A.3/A.4 + RGPD cards
- **A.6** E2E gates — Playwright (full legal chain) + Lighthouse a11y CI (WCAG 2.1 AA, EAA non-negotiable depuis 28 juin 2025)

### Phase B — Monetization

- **B.1** Billing via `@better-auth/stripe` — customer portal + webhooks idempotents + dunning. Depends on 0.1.
- **B.2** Feature & quota gating — config + middleware (no DDD).

### Phase C — Security perimeter & operations

> Event-driven foundation shipped → **C.2 and C.5 reduced to front UI only**.

- **C.1** Security perimeter — rate-limit (sliding-window per IP/user, captcha auth-burst), strict CSP nonce (no `unsafe-inline`), CSRF on non-BetterAuth POST
- **C.2** Audit log **front UI** — `/admin/audit-log` page (filters + expand metadata diff). API + write-path shipped via event-driven.
- **C.3** Admin & impersonation (BetterAuth `admin` plugin) — depends on C.2 audited
- **C.4** API tokens / PATs — `/settings/tokens`, scoped + expirable, sha256 + per-row salt, `clean_<base58url-32>` prefix for GitHub secret-scanner
- **C.5** Webhooks **front UI** + `webhook.test` event — `/settings/webhooks` page + public event catalog. API + worker shipped via event-driven.
- **C.6** Account recovery codes UI — BetterAuth backend already supports
- **C.7** SSO SAML/OIDC + SCIM (BetterAuth `sso` + SCIM endpoint) — biggest enterprise multiplier. Audit integration trivial via `onEvent`.

### Phase D — Customer-facing readiness

- **D.1** Status page + SLO dashboards + alerting (Cachet/Astro + Grafana consuming 0.4 `/metrics` + Sentry → Slack/PagerDuty)
- **D.2** OpenAPI auto-docs (`@hono/zod-openapi` + Scalar UI at `/api/docs`)
- **D.3** In-app notification center — `<Bell />` + `/settings/notifications`. **Handler = 1-line `onEvent(...)` via event-driven foundation.**
- **D.4** SOC2 Type II checklist — mapping shipped items to controls

### Phase E — International + growth

- **E.1** i18n (TanStack Router locale routes + Lingui)
- **E.2** Marketing site (Astro 5 + Payload 3, self-hosted)

### Phase F — Mobile + extension

- **F.1** Capacitor mobile shell — depends on C.4 PATs + D.3 notifications
- **F.2** Feature flags (GrowthBook self-hosted)

### Cross-cutting (ship at first consumer)

- One-click unsubscribe RFC 8058 (Resend `List-Unsubscribe-Post`) — first marketing template lands
- Email auth (SPF + DKIM + DMARC `p=reject`) — DNS, doc only
- NIS2 readiness checklist — when clone passes ≥50 employees / €10M revenue

### Out of scope

HIPAA tooling, real-time WebSocket/SSE bus, third-party app marketplace, A/B testing framework, IAB TCF v2.2.

---

## Event-driven foundation — **shipped**

**Why**: every cloned SaaS needs the same event plumbing — outbox for at-least-once delivery, audit log for compliance, webhooks for customer integrations, in-process handlers for side-effects. Building that rail once-for-all unlocks Phases C.2 (audit), C.5 (webhooks), A.4 (consent handlers), D.3 (in-app notifs), C.7 (SSO audit) and the observability port subscribers (Phase 0.4) — each becomes a 1-line `onEvent(...)` declaration instead of a per-feature plumbing chunk.

**DX contract — zero plumbing post-clone**: a dev cloning the boilerplate writes (1) a 1-line entry in `packages/events/src/event-types.ts` for a new event type, (2) `aggregate.addEvent(new XEvent(...))` in their domain method, (3) `this.uow.run(async tx => repo.save(agg, tx))` in their use-case — outbox enqueue happens transparently via `AsyncLocalStorage` event collector + `IUnitOfWork.run()` flush pre-commit. Audit trail and webhook fan-out are automatic for any event in the retention map. In-process handlers declared via `onEvent(type, factory)` + 1 inwire `b.add(...)` are auto-discovered at boot (container introspection via `EVENT_HANDLER_SYMBOL` marker).

**Shipped surface**:

- [x] **Outbox table** `outbox_event` (UUID v7 PK for B-tree locality + time ordering, partial index `WHERE dispatched_at IS NULL`, CloudEvents 1.0 metadata envelope) + Postgres `LISTEN/NOTIFY` trigger ensured at boot (`pg_notify` queued until COMMIT — visibility-safe).
- [x] **`OutboxDispatcher`** (in-process Bun worker, dedicated `pg.Client` for LISTEN + reconnect with backoff + 30s poll fallback + `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 50` drain — multi-instance ready). Container introspection auto-wires user-defined `EventHandler<T>` bindings.
- [x] **Built-in subscribers** (`AuditEventSubscriber` writes audit row idempotently via deterministic `audit-${event.id}`, `WebhookFanoutSubscriber` enqueues `webhook_delivery` rows scoped by `organizationId` + `eventTypes` array match).
- [x] **`@packages/events`** — central catalog (29 events covering BetterAuth user/session/account, organization/member/invitation, RGPD deletion/export, uploads), Zod payloads per event, `RETENTION_MAP` (operational/compliance/none).
- [x] **`@packages/ddd-kit` primitives**: `Aggregate.pullDomainEvents()` atomic, `EventCollector` ALS, `IUnitOfWork.run(cb)` standardized (flushes ALS to outbox via `flushHandler` injected in `TransactionService`), `onEvent(type, factory)` + `EVENT_HANDLER_SYMBOL` for inwire-discovered handlers, UUID v7 primitive (replaces v4 default in `UUID.create()`).
- [x] **AEAD secret crypto** for webhook secrets: `@noble/ciphers` XChaCha20-Poly1305 + HKDF-SHA256 per-org sub-key from `WEBHOOK_MASTER_KEY` (32-byte hex env var). `@noble/hashes` v2.
- [x] **Decorrelated jitter backoff** (AWS Architecture Blog spec) for outbox + webhook retries; dead-letter after 5 attempts; total window ~12h.
- [x] **BetterAuth bridge** (`apps/api/src/auth.ts`) — **21 unique events emitted automatically** (13 user + 8 org, 23 emit sites — USER_PASSWORD_CHANGED + ORG_MEMBER_JOINED each fire from 2 paths), 3 voies SOTA combinées :
  - `databaseHooks` (TX-bound, captures all flows including non-HTTP) — `user.create.after` (USER_CREATED), `session.create.after` (USER_SIGNED_IN), `session.delete.after` (USER_SIGNED_OUT), `account.delete.after` (USER_ACCOUNT_UNLINKED, skip credential).
  - `hooks.after` + `createAuthMiddleware` (path-based, plugin events) avec filter `if (ctx.context.returned instanceof APIError) return` — `/two-factor/{enable,disable}` (USER_MFA_ENABLED/DISABLED), `/passkey/verify-registration` (USER_PASSKEY_ADDED, lookup latest), `/passkey/delete-passkey` (USER_PASSKEY_REMOVED, body.id), `/verify-email` (USER_EMAIL_VERIFIED), `/change-password` (USER_PASSWORD_CHANGED), `/link-social` (USER_ACCOUNT_LINKED, lookup latest non-credential account < 5s).
  - Native callbacks — `emailAndPassword.{sendResetPassword,onPasswordReset}` (USER_PASSWORD_RESET_REQUESTED + USER_PASSWORD_CHANGED), `magicLink.sendMagicLink` (USER_MAGIC_LINK_REQUESTED).
  - `organizationHooks` (org plugin) — `afterCreateOrganization` (ORG_CREATED), `afterUpdateOrganization` (ORG_UPDATED), `afterDeleteOrganization` (ORG_DELETED), `afterAddMember` (ORG_MEMBER_JOINED — direct add only) **+** `afterAcceptInvitation` (ORG_MEMBER_JOINED — invitation accept; the two lifecycles are independent in BetterAuth and both must be wired), `afterRemoveMember` (ORG_MEMBER_REMOVED), `afterUpdateMemberRole` (ORG_MEMBER_ROLE_CHANGED), `afterCreateInvitation` (ORG_MEMBER_INVITED), `afterCancelInvitation` (ORG_INVITATION_CANCELLED).
  - **RGPD service** — USER_DELETION_{REQUESTED,CANCELLED}, USER_DELETED, USER_EXPORT_{REQUESTED,COMPLETED} (payload: `storageKey`, jamais l'URL presigned — security).
  - **UploadService** — UPLOAD_REQUESTED + UPLOAD_CONFIRMED (payload: `hashKey(key)` sha256-truncated, jamais le filename brut — PII).
  - Race window BetterAuth COMMIT ↔ outbox enqueue acceptée et documentée (pas de 2PC).
- [x] **Multi-tenant safety**: events avec `organizationId = null` (platform: USER_CREATED, USER_SIGNED_IN, etc.) skippent le webhook fanout — never broadcast across tenants. Validé runtime via smoke test (signup → user.created → audit row écrite, fanout subscriber early return).
- [x] **Lifecycle**: `OutboxDispatcher.start()` + `WebhookDeliveryWorker.start()` at boot in `apps/api/src/index.ts`; SIGTERM/SIGINT graceful drain.
- [x] **Tests**: `event-collector.test.ts` (ALS isolation between concurrent contexts), `aggregate.test.ts` extension (`pullDomainEvents` atomic), `jitter.test.ts` (bounds + dead-letter), `aead.test.ts` (encrypt/decrypt round-trip + sub-key determinism + ciphertext tampering rejection), `hmac-signer.test.ts` (Stripe-format signature + verify round-trip + stale timestamp window).

**Remaining — front UI pages** (back is shipped, ~12-15h app-side total):

- [ ] **`/admin/audit-log`** page (Phase C.2) — table read-only avec filtres (actor, action, target, dateRange, action prefix), pagination cursor, expand row → JSON viewer pour `metadata`. Permission `auditLog: ["read"]` (owner/admin). API ready: `di.AuditQueryService.listForOrg(orgId, filters)`. **Estimation: ~3-4h.**
- [ ] **`/settings/webhooks`** page (Phase C.5) — CRUD endpoints + create-secret-shown-once dialog modal + list deliveries par endpoint avec status filter + replay button + dead-letter view. Permission `webhooks: ["read","write"]` (owner/admin). API ready: `POST/GET/PATCH/DELETE /settings/webhooks/*`. **Estimation: ~6-8h.**
- [ ] **Public event catalog page** (Phase C.5 companion) — `/docs/events` ou `/legal/event-types` enumerating les 29 events emitted with their Zod payload schemas. Pas de gating. Source: `packages/events/event-types.ts` + `payloads.ts`. **Estimation: ~2h.**

**Remaining — backend mineur**:

- [ ] **`webhook.test` event type** — sent on endpoint creation, surfaces "is the URL reachable" feedback in UI. ~30min after the front page lands.
- [ ] **Tamper-evidence audit hash chain** — columns posées (`prevHash`/`hash`), calc gated by `AUDIT_TAMPER_EVIDENCE=false` env flag. Implementation deferred until SOC2 audit demands (Merkle batch ou hash chain row-lock).
- [ ] **Phase 0.4 observability subscribers** (Sentry/OTel/Prom) — trivial 1-line `onEvent(...)` additions when those modules land.
- [ ] **`USER_EMAIL_VERIFIED`** path edge case: `ctx.context.session?.user.id` peut être `null` si auto-sign-in pas encore propagé. Skip silencieux actuellement. Workaround propre : extraire userId du verification token (BetterAuth API not exposed publicly today — check v1.7+).
- [x] **`UPLOAD_DELETED`** event + `DELETE /uploads` route shipped. Ownership-gated (`key.startsWith(\`${ownerId}/\`)` → 403 sinon), emit après `storage.deleteObject()` succès, payload utilise `hashKey(key)` (PII-safe).

**Setup checklist post-clone** (pour le cloner):

1. `pnpm db:push` après premier clone (créé les 4 nouvelles tables + indexes).
2. `WEBHOOK_MASTER_KEY` dans `apps/api/.env` (32 hex bytes; `openssl rand -hex 32`). Required en prod, vérifié au boot.
3. (Optionnel) `AUDIT_TAMPER_EVIDENCE=false` (défaut). Flip à `true` quand SOC2 audit demande hash chain.

---

## Health probes — **Phase 0.2**

**Why**: Kubernetes / Railway / Fly.io / Cloudflare Workers / Render all probe liveness/readiness/startup. Absence = restart loops, no rolling deploys, 502s during deploys. SOTA 2026 = three probes (not two), draft-inadarei response format, graceful shutdown wired to `/readyz`.

**Endpoint shape — convention K8s 2026** (`z` suffix is the official one; `/health` / `/ready` are the legacy names):

- [ ] `GET /livez` — liveness. Returns 200 with `{ status, version, commitSha, buildTime, runtime, uptimeMs }`. **No dependency hit** (a DB outage must NOT restart pods — would cause thundering herd). `commitSha`/`buildTime` injected at build via `GIT_SHA` / `BUILD_TIME` env vars (CI sets them).
- [ ] `GET /readyz` — readiness. Aggregates registered checks (DB `SELECT 1`, R2 `HeadBucket`, Resend cached health). Returns 200 if all `pass`/`warn`, 503 if any critical check is `fail`.
- [ ] `GET /startupz` — startup probe (K8s 1.16+). Distinct from liveness so a slow boot (warming caches, DI graph build) doesn't get killed by a tight liveness threshold. Returns 200 once initial bootstrap completes; 503 before.

**Response format — IETF `draft-inadarei-api-health-check-06`** (Datadog / New Relic / Grafana parse it natively):

```json
{
  "status": "pass" | "warn" | "fail",
  "version": "1.11.1",
  "checks": {
    "db:postgres": [{ "status": "pass", "time": "2026-05-04T23:00:00Z", "observedValue": 12, "observedUnit": "ms" }],
    "storage:r2":  [{ "status": "pass", "time": "...", "observedValue": 38, "observedUnit": "ms" }],
    "email:resend": [{ "status": "warn", "output": "cached, last refresh 25s ago" }]
  }
}
```

- [ ] **Tri-state status** (`pass`/`warn`/`fail`) — non-binary. Resend down + DB up = `warn` + 200 (degraded but functional). DB down = `fail` + 503 (truly unhealthy). Aligns with the draft and avoids the "everything red because Resend hiccup'd" problem.
- [ ] **Per-check `observedValue` + `observedUnit`** — latency in ms; populates Phase D.1 SLO dashboards for free.
- [ ] **Prod payload minimal** — outside `NODE_ENV !== "production"`, only the top-level `status` field is returned to avoid leaking infra details (DB host, bucket name in error messages). Full payload in dev/staging.

**Architecture — registry pattern, futureproof**:

- [ ] `apps/api/src/modules/health/` — vertical-slice module. `IHealthCheckRegistry` port (`register(name, fn, { critical: boolean })`); each module registers its own checks at boot (`db.register("db:postgres", probeDb, { critical: true })`). `/readyz` iterates the registry. **Why a module**: when Stripe / Redis / GrowthBook ship, each module adds 1 line to register its check — no edits to the health endpoint.
- [ ] `IHealthCheckRegistry` exposed to other modules via `shared/ports/health.port.ts` (cross-module port, two consumers minimum: rgpd + uploads register storage health from existing impls).

**Robustness — what kills probes in production**:

- [ ] **Cache positive 30s + cache negative 5s** — healthy result is cached 30s (don't hammer Resend on every PaaS probe, ~6 req/sec); failed result cached only 5s (re-check fast, restore quickly). Asymmetric cache is the SOTA pattern.
- [ ] **Self-cancelling timeout 5s on `/readyz`** — `Promise.race(check, timeoutFail(5000))`. A probe that hangs blocks rolling deploys.
- [ ] **No PII in fail payloads** — never return stack traces, hostnames, env-var values, full DB error messages. Just the failed check name + a generic code (`db: down`).

**Graceful shutdown — wired to `/readyz`** (the single most critical zero-downtime piece, and the one most boilerplates skip):

- [ ] On `SIGTERM` (PaaS sends it before kill), set an in-memory `isShuttingDown = true` flag. `/readyz` immediately returns 503 — the LB stops routing new requests to this pod within one probe interval (~5s).
- [ ] Wait `SHUTDOWN_GRACE_PERIOD_MS` (default 15s — env-tunable per PaaS) for in-flight requests to drain. Then `Bun.serve.stop()` + close DB pool + flush pino transport.
- [ ] **Why critical**: without this, the pod accepts new requests while terminating → intermittent 502s during every deploy. Visible to end-users.

**Phase D.1 prep — Prometheus metrics** (cheap to wire now, expensive to retrofit):

- [ ] `GET /metrics` — `prom-client` exports `up{check="db:postgres"} 1|0` per registered check + `health_check_duration_ms{check}` histogram. ~15 LOC. When D.1 status page lands, it consumes `/metrics` directly — no rework.
- [ ] Gate `/metrics` behind a shared secret header (`X-Metrics-Token` env var) — prevents random scraping from public internet.

**Mounting + observability**:

- [ ] All three probes (`/livez`, `/readyz`, `/startupz`) and `/metrics` mounted **outside** `requestId` + `httpLogger` + `requireAuth`. Probes don't carry session cookies, and a probe every 5s would drown prod logs (~17 280/day per pod).
- [ ] Probes excluded from rate-limiting (Phase C.1) — PaaS probe IPs aren't predictable.

**Documentation**:

- [ ] `README.md` deploy section — one config example per target: Railway (`railway.toml` healthchecks), Fly.io (`fly.toml [[checks]]`), Cloudflare Workers (no probes — N/A note), Render (`render.yaml healthCheckPath`), Kubernetes (manifest snippet with `livenessProbe` + `readinessProbe` + `startupProbe`).
- [ ] `docs/HEALTH-PROBES.md` — registry usage (how to register a check from a new module), draft-inadarei format reference, graceful-shutdown rationale, monitoring integration recipes (Datadog, Grafana).

---

## Backups + disaster recovery — **Phase 0.3**

**Why**: a backup never tested isn't a backup. SOC2 §A.1 + ISO 27001 A.12.3 prerequisite; client-side trust signal. SaaS-killer if the first prod incident reveals the dump is corrupt.

- [ ] **Daily `pg_dump` cron** → R2 bucket `<R2_BACKUP_BUCKET>/postgres/<YYYY-MM-DD>.sql.gz`. Signed via existing `internal-fetch` HMAC. Retention 30 days (lifecycle rule on R2). **3-2-1 rule**: 3 copies (live + R2 + monthly cold), 2 medias (live DB + R2), 1 offsite (R2 in different region from app DB).
- [ ] **R2 lifecycle policy** — daily retained 30d, monthly snapshots retained 1y in cold-storage class (Glacier-equivalent, ~$0.01/GB/month).
- [ ] **Monthly automated restore-test** — cron spins ephemeral Postgres on port `5436`, restores latest dump, runs `pnpm db:smoke` (read-only count check on every table), reports to status page. Failure = page on-call.
- [ ] **`docs/DISASTER-RECOVERY.md`** — RPO (max acceptable data loss = 24h with daily dump, 1h target with PITR enabled), RTO (max acceptable downtime = 1h), runbook for restore (commands, verification steps, rollback decision tree).
- [ ] **PITR (Point-in-Time Recovery)** documented as prod requirement — Neon/Supabase/managed-Postgres all expose it; self-hosted Postgres needs `wal_level=replica` + `pg_basebackup` + WAL shipping. README deploy section flags this.
- [ ] **R2 bucket versioning + delete protection** on the backup bucket — guards against accidental `aws s3 rm --recursive`.

---

## Error tracking + structured logging fan-out — **Phase 0.4**

**Why before Phase A**: every phase A/B/C ships prod code. Without Sentry active from day one, you're blind on errors until Phase D.1 — six phases away. The wiring cost today (~2-3h, this phase) is dwarfed by the cost of debugging without traces/breadcrumbs across all of A, B, C. SOTA 2026 boilerplates ship error tracking before customer-facing features, not after.

**Why detachable matters more than which provider**: a clone might want Sentry, GlitchTip self-hosted, Highlight, or no error tracking at all (closed network, classified env). The architecture below makes the provider a 1-line swap and the whole stack a 5-min trash. **Removability is the contract**, providers come and go.

### Architecture — ports + NoOp default + retirable module

The pattern mirrors what's already shipped for `email.port` (Resend swappable) and `storage.port` (R2/SeaweedFS swappable):

```
apps/api/src/
  shared/
    ports/
      error-tracker.port.ts    IErrorTracker { capture(err, ctx), addBreadcrumb(crumb) }
      metrics.port.ts          IMetrics { increment, histogram, gauge }
      tracer.port.ts           ITracer { startSpan, withSpan }
    services/
      noop-error-tracker.ts    Always shipped — silent no-op
      noop-metrics.ts          Always shipped
      noop-tracer.ts           Always shipped
  modules/observability/        ← retirable module
    infrastructure/
      sentry-error-tracker.ts  @sentry/bun adapter
      prom-metrics.ts          prom-client adapter
      otel-tracer.ts           OTel auto-instrumentation
    routes.ts                  GET /metrics (Prom scrape, gated by X-Metrics-Token)
    module.ts                  Overrides DI bindings WHEN env vars present
```

- [ ] **Default container bindings** (in `container.ts`, always present) bind `IErrorTracker`/`IMetrics`/`ITracer` to NoOp impls. Code calling `di.IErrorTracker.capture(err)` works regardless of whether the observability module ships.
- [ ] **Module overrides bindings conditionally**: `env.SENTRY_DSN` → SentryAdapter, else NoOp. `env.PROM_TOKEN` → PromAdapter, else NoOp. Environment is the toggle, not a feature flag.
- [ ] **3 ports, not 1 fat `IObservability`** — Sentry/Prom/OTel are independent providers with independent SDKs. Fusing them forces cross-deps between unrelated adapters. SOTA 2026 = 3 ports.

**Removal contract — 5 min, validated as part of this phase**:

1. `trash apps/api/src/modules/observability`
2. Remove `.addModule(observabilityModule)` from `container.ts` (1 line)
3. Remove `app.route("/metrics", metricsRoutes)` from `index.ts` (1 line)
4. `.env`: unset `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `PROM_TOKEN`
5. Front: `trash apps/app/src/shared/observability/sentry.ts` + remove 1 `Sentry.init()` line from `main.tsx`

All call-sites (`di.IErrorTracker.capture(...)`, `<ErrorBoundary>` in app) keep working — they hit NoOp impls in `shared/services/`. **Zero refactor.** This removal must be exercised in the same phase that ships the observability module — otherwise the contract drifts.

### Sentry — error tracking (api + app)

**API**:

- [ ] `@sentry/bun` SDK (native Bun support since 2024 — no Node shim).
- [ ] Init in `modules/observability/infrastructure/sentry-error-tracker.ts`. Module-level singleton, **deliberate exception** to DI (same rationale as BetterAuth: wrapping recopies the SDK API and loses typing).
- [ ] Hook into the existing `errorHandler` middleware: capture `>= 500` only, skip 4xx (operational, not error). Tags auto-populated from Hono context: `requestId`, `userId` (from session), `orgId` (from `c.var.orgId` when present).
- [ ] **`beforeSend` data scrubbing**: strip `email`, `name`, `Authorization` header, `Cookie` header, full request body. Whitelist-based, not blacklist (default = drop). RGPD-clean — gross differentiator for EU clients.
- [ ] **Release tracking** ties to `commitSha` injected at build time (already used in `/livez` from Phase 0.2). `Sentry.init({ release: env.GIT_SHA })`. Lets you read a probe in a degraded pod and immediately diff against the previous release in Sentry.
- [ ] **Source maps upload** at build via CI step — `@sentry/cli sourcemaps upload --release=$GIT_SHA`. Without this, prod stack traces are minified gibberish.
- [ ] **Sentry EU region option** (`SENTRY_DSN` may point to `*.eu.sentry.io`) documented in `apps/api/.env.example` — RGPD data residency for EU clientele.

**App**:

- [ ] `@sentry/react` + `@sentry/vite-plugin` (auto source maps upload at build).
- [ ] `apps/app/src/shared/observability/sentry.ts` — stable exported API: `captureError()`, `addBreadcrumb()`. NoOp impl in `noop.ts`, real impl in `sentry.ts` (swap by env: if `VITE_SENTRY_DSN` then real, else noop). Same removal contract.
- [ ] **ErrorBoundary at router root** (in `__root.tsx` or `<AppProviders />`): captures render errors, displays a fallback, logs to Sentry. TanStack Router error boundary integration handles route-level errors automatically.
- [ ] **Session replay opt-in** (free up to 50 sessions/month on Sentry SaaS, ~3KB additional bundle). Ship behind a separate env flag (`VITE_SENTRY_REPLAY=true`) so removal is independent. Privacy-first defaults: mask all input, mask all text, redact images.

### Pino transport — structured logging fan-out

- [ ] `@sentry/pino-transport` — every `logger.warn` / `logger.error` becomes a Sentry breadcrumb automatically. Single source of truth for logs; Sentry sees the same trail you see in stdout. **No double-capture** of the same event.
- [ ] Pino remains the writer for stdout (PaaS log ingestion); Sentry transport runs in parallel. Keep the JSON line format unchanged so existing log parsers don't break.

### OpenTelemetry — distributed tracing

- [ ] `@opentelemetry/sdk-node` (works under Bun since 1.2+) with auto-instrumentation packages: `@opentelemetry/instrumentation-http` (Hono / Bun.serve), `@opentelemetry/instrumentation-pg` (Drizzle pool), `@opentelemetry/instrumentation-fetch` (outbound to Resend / R2 / Stripe later).
- [ ] **Sentry consumes OTel natively since 2024** — set `tracesSampleRate: 0.1` and Sentry Performance picks up the spans without a second export pipeline. Single provider, two products (errors + performance).
- [ ] **`traceparent` header propagation api ↔ app** — front injects via fetch interceptor in `api-client.ts`, api reads it in middleware. End-to-end traces from a click in the app to a DB query, gratis.
- [ ] OTel SDK init lives in `modules/observability/infrastructure/otel-tracer.ts` — imported once at the top of `index.ts` (must run before any other instrumented module). Removing the module = remove the import = OTel disappears entirely.

### Prometheus `/metrics` — for Phase D.1 dashboards

- [ ] `prom-client` exposes histograms + counters via `IMetrics` port adapter.
- [ ] Default metrics: HTTP request duration histogram (labels: route, method, status), DB query duration (from OTel pg instrumentation, exposed as Prom metric), business counters wired by each module (`registry.increment("rgpd.deletion.requested")`).
- [ ] **Health checks export their state**: `up{check="db:postgres"} 1|0` from the registry built in Phase 0.2 — Phase D.1 status page reads `/metrics` directly without rework.
- [ ] **`GET /metrics` mounted in observability module routes**, gated by `X-Metrics-Token` shared secret (env var). Mounted **outside** `requireAuth` (Prom scrapers don't carry sessions) and outside `httpLogger` (no log spam from 5s scrape interval).
- [ ] Dropped if observability module is removed — and that's fine, no other code consumes `/metrics`.

### Documentation

- [ ] `docs/OBSERVABILITY.md` — port usage (how to capture an error, increment a counter, start a span), removal procedure (the 5-min contract), provider swap recipe (Sentry → GlitchTip self-hosted, drop-in API-compatible), data scrubbing rationale, EU region setup.
- [ ] `apps/api/.env.example` — `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `PROM_TOKEN` documented with empty defaults (NoOp fallback).
- [ ] `apps/app/.env.example` — `VITE_SENTRY_DSN`, `VITE_SENTRY_REPLAY`, `VITE_SENTRY_ENVIRONMENT`.

---

## Right to rectification UI + NIST 800-63B-4 password baseline — **Phase A.1**

**Why first**: bundles two non-negotiables in one push. Art. 16 GDPR rectification (BetterAuth backend already supports it, UI gap only) + the SOTA-2026 password baseline (NIST SP 800-63B-4 final August 2025). Both touch the same surface (`/settings/profile` + auth flows), shipping them together avoids a second pass.

**Rectification (Art. 16) tasks**:

- [ ] `/settings/profile` page — edit name, email (with re-verification flow), avatar (upload via existing `uploads` module).
- [ ] Form: RHF + zodResolver, `name` (max 100), `email` (re-verify on change — BetterAuth auto-handles email verification challenge), avatar (`<UploadAvatar />` reusing presign+confirm flow from `uploads`).
- [ ] On email change: BetterAuth sends new verification mail, old email invalidated until new one verified, UI shows "Pending email change to X" badge.
- [ ] Replace the `disabled` placeholders currently in `features/account/account.page.tsx` with active fields, keep the page composition (security cards stay below).
- [ ] Audit-log entry: `user.profile.updated` with diff metadata (deferred — depends on Phase C.2).

**Password baseline (NIST SP 800-63B-4)**:

- [ ] **Min length 15 chars** for single-factor accounts, **8 chars** acceptable when MFA enrolled. BetterAuth `password.minLength` defaults to 8 — bump to 15, with override path post-MFA enrollment.
- [ ] **HIBP screening** at sign-up + password change — `k-anonymity` API (`https://api.pwnedpasswords.com/range/<sha1[:5]>`), reject if hash suffix matches. Wrap in `IPasswordBreachService` port (provider-agnostic) + `HibpPasswordBreachService` impl in `shared/services/`.
- [ ] **Ban complexity rules** — confirm BetterAuth doesn't enforce uppercase/symbol requirements. NIST 800-63B-4 §3.1.1.2 says `SHALL NOT` impose complexity.
- [ ] **Ban forced rotation** — confirm no scheduled "your password is N months old, change it" prompt. Rotation only on compromise (auto-trigger on HIBP match at next login or admin-initiated reset).
- [ ] **Phishing-resistant MFA = passkeys** (already shipped via `passkey()` plugin — gold standard per NIST 800-63B-4). Document in `/settings/security` UI as the recommended method, ahead of TOTP.
- [ ] **Block sequential / contextual / common passwords** — additional NIST recommendation: reject `email-local-part`, `name`, `<service-name>2026`. Wire a list-banned-tokens check (~20 LOC, no external service).

---

## Privacy policy / Terms versioning — **Phase A.2**

**Why second**: foundational for A.4 (consent stamps the policy version) and A.5 (privacy dashboard surfaces acceptance history). Art. 7 §1 RGPD — "the controller shall be able to demonstrate that the data subject has consented". Requires logging WHICH version was accepted. Current boilerplate has zero versioning.

- [ ] DB schema `policy_acceptance(userId, policyType: "privacy"|"terms", policyVersion, acceptedAt, ipAddress)` — append-only.
- [ ] `apps/app/src/features/legal/policies.config.ts` — `PRIVACY_VERSION = "2026-01-15"`, `TERMS_VERSION = "2026-01-15"`. Bump triggers re-acceptance.
- [ ] `requireCurrentPolicies` middleware — if user's latest accepted version < current, return 409 with re-acceptance gate URL. Front route gate redirects to `/legal/accept` blocking modal.
- [ ] `/legal/accept` page — diff view (what changed since previous version), accept button writes `policy_acceptance` row.
- [ ] Sign-up flow: accept current versions inline (checkbox + link).
- [ ] Audit-log entry on each acceptance (`compliance` retention) — deferred until Phase C.2 lands.

---

## Compliance docs bundle — **Phase A.3**

**Why third (bundled)**: 4 pure-config / Markdown items that share the same context (legal disclosure pages + contractual templates). ~3h total. Each missing one blocks a specific scenario: no sub-processor page = Art. 28 GDPR violation; no accessibility statement = EAA Art. 14 violation since June 28 2025; no DPA template = every EU client demands it at signature; no DORA annex = no fintech/insurance deal can sign since Jan 17 2025.

**Sub-processor disclosure** (Art. 28 GDPR):

- [ ] `apps/app/src/features/legal/sub-processors.config.ts` — typed const `SUB_PROCESSORS = [{ name: "Resend", purpose: "Transactional email", region: "US (DPF-certified)", url: "https://resend.com/legal/dpa", category: "infra" }, ...] as const`. Pre-fill with current stack: Resend, Cloudflare R2, BetterAuth providers, future Stripe + GrowthBook + Umami.
- [ ] `/legal/sub-processors.page.tsx` — table view, last-updated timestamp, RSS-style change history (next-step: trigger re-acceptance when sub-processor list changes — Art. 28 §2 requires advance notice).
- [ ] Linked from `/legal/data-rights` + footer + `/settings/privacy` (A.5).

**Accessibility statement** (EAA Art. 14, mandatory since June 28 2025):

- [ ] `/legal/accessibility.page.tsx` — declares conformance level (target: WCAG 2.1 AA per EN 301 549 v3.2.1, the EAA harmonised standard), known limitations, contact for complaints, last review date.
- [ ] **Complaint procedure** — embedded form or dedicated email alias (`accessibility@<domain>`). Mandatory per EAA — users must have a channel to flag a barrier.
- [ ] Linked from footer (every page) + `/legal/data-rights`.
- [ ] Auto-update mechanism: tied to A.6 Lighthouse CI gate — when audit results change, page reflects the new conformance state.

**Contract templates** (Markdown in `docs/legal/`):

- [ ] `docs/legal/DPA-template.md` — Data Processing Agreement covering Art. 28 GDPR clauses: scope of processing, sub-processor list (link to `/legal/sub-processors`), data location, retention, audit rights, sub-processor notice (30 days), incident notification (72h), end-of-contract data return/deletion. Boilerplate clauses + `[CLIENT_NAME]` / `[EFFECTIVE_DATE]` placeholders.
- [ ] `docs/legal/DORA-annex-template.md` — Digital Operational Resilience Act annex for fintech/insurance EU clients (mandatory since 17 Jan 2025). Clauses: SLA targets (RPO/RTO mirroring Phase 0.3), audit rights (on-site + remote), data location, exit plan + reversibility, incident reporting (mirror NIS2 24h/72h/1-month), sub-processor concentration (cap on critical sub-processors), insurance proof of cover. Sourced from the 11 mandatory DORA Article 30 contractual provisions.
- [ ] `docs/legal/README.md` — index of all legal templates with usage notes ("when a fintech client is in pipeline, send DPA + DORA annex; non-fintech B2B = DPA only").

---

## Cookie consent + Consent management — **Phase A.4**

**Why now (after A.1-A.3)**: the moment any clone adds analytics (Umami, Plausible, GA), Stripe pixel, intercom, hotjar, anything — without a CNIL-conform banner the deploy is illegal in EU. ePrivacy directive + RGPD Art. 7. Currently the boilerplate has zero consent surface, so it's `clone → add Umami → fine`. Block that. Stamps **policy version from A.2** on every consent record so version bumps invalidate stale consents cleanly.

**Why this is the boilerplate's first real DDD module**: `Consent` carries invariants (granted-at timestamp, policy-version-at-grant, scope set, expiration ≤ 13 months, granted == not withdrawn). It's a real aggregate — not infra orchestration. First user of `@packages/ddd-kit/Aggregate` + `DomainEvent` + `EventDispatcher` in the boilerplate. Validates the kit isn't dead code.

**Decided constraints** (CNIL 2024+ guidelines, EDPB 2024 binding decisions):
- Reject-all button **same visual prominence** as accept-all (same size, same level, same color contrast). Single click reject.
- Granular categories: `necessary` (always on, no toggle), `functional`, `analytics`, `marketing`. Each toggleable, default OFF except `necessary`.
- Respect `Sec-GPC: 1` (Global Privacy Control) and `DNT: 1` headers — auto-decline analytics/marketing if either present.
- Re-prompt cadence: 6 months minimum after refusal (don't pester), 13 months max validity for granted consent (Art. 5 + EDPB).
- Withdrawal as easy as granting — `<ConsentSettings />` accessible from footer + `/settings/privacy`, single-click withdraw.
- Server-side authoritative — banner-side `localStorage` is UX cache, the `consent_record` table is source of truth.
- Versioned per policy — when privacy policy version bumps, all granted consents are invalidated and user re-prompted.

**Architecture** — first-class module, not infra:

```
modules/consents/
  domain/
    consent.aggregate.ts           Consent extends Aggregate<ConsentProps>
                                     - props: userId, policyVersion, categories: Set<Category>, grantedAt, withdrawnAt?, expiresAt
                                     - invariants: validate(), grant(), withdraw(), isActive()
                                     - emits: ConsentGranted, ConsentWithdrawn, ConsentExpired
    consent-category.vo.ts         ValueObject<"necessary"|"functional"|"analytics"|"marketing">
    consent.events.ts              ConsentGranted, ConsentWithdrawn, ConsentExpired
  application/
    ports/
      consent.repository.port.ts   IConsentRepository (ScopedRepository<Consent, UserScope>)
    use-cases/
      record-consent.use-case.ts   Validates policy version current, upserts active consent, dispatches event
      withdraw-consent.use-case.ts Withdraws active consent for given category, dispatches event
      get-active-consents.use-case.ts Returns active categories for user
    event-handlers/
      invalidate-analytics-on-withdraw.handler.ts
    dto/
      record-consent.dto.ts        zod: { categories: Category[], policyVersion: string }
  infrastructure/
    repositories/
      drizzle-consent.repository.ts
  routes.ts                        POST /me/consents (record), DELETE /me/consents (withdraw all), GET /me/consents
  module.ts
```

**DB schema** (`packages/drizzle/src/schema/consent.ts`):
- `consent_record(id, userId FK, policyVersion, categories jsonb, grantedAt, withdrawnAt nullable, expiresAt, ipAddress, userAgent)` — append-only history (no UPDATE; new row = new state). Compliance trail.

**Frontend**:
- `<CookieBanner />` in `apps/app/src/shared/components/` — auto-mounted in `app-providers.tsx`, hidden when active consent matches current policy version.
- `useConsent("analytics")` hook — returns `boolean`, drives conditional script loading (Umami `<script />` only mounts if `true`).
- `<ConsentSettings />` reusable card — used in banner expansion + `/settings/privacy`.
- Server-rendered initial state via `consentQueryOptions` to avoid flash-of-banner on hydrate.

**Tasks**:

- [ ] Drizzle schema `consent_record` + migration. Index on `(userId, expiresAt DESC)`.
- [ ] `modules/consents/` skeleton (domain aggregate + repo + use cases + routes + module.ts) — first module under `@packages/ddd-kit/Aggregate`.
- [ ] DB hook on `policy_version` change: invalidate all `consent_record` (set `expiresAt = NOW()`).
- [ ] `recordConsent` writes ip + UA from request context (compliance evidence).
- [ ] `<CookieBanner />` + `<ConsentSettings />` components in `@packages/ui` (reusable across app + future marketing site).
- [ ] `useConsent(category)` hook in `apps/app/src/shared/hooks/`.
- [ ] Auto-decline on `Sec-GPC: 1` / `DNT: 1` — Hono middleware reads header, frontend reads `navigator.globalPrivacyControl`.
- [ ] Re-prompt timing: refuse → 6-month cooldown stored in `consent_record.expiresAt` (custom shorter window for refusal vs grant).
- [ ] Withdraw all UX: footer link `Cookie settings` + `/settings/privacy` toggle. Withdrawal is single-click, no confirm dialog (CNIL).
- [ ] Domain event handler: on `ConsentWithdrawn(analytics)`, fire client-side `umami.disable()` (or analog) — no late-arriving events.
- [ ] Audit-log integration (Phase C.10) — every grant/withdraw/expiry call `recordAudit({ action: "consent.granted|withdrawn|expired", retention: "compliance" })`.
- [ ] Public `/legal/cookies` page enumerating all categories with their concrete cookie names + purposes + retention (CNIL transparency obligation, copy from a config).

**Out of scope (rule 14 — promote on second occurrence)**:

- Per-region rules (US California vs EU vs UK vs Brazil LGPD). Ship the strictest (EDPB) and document override hooks. CCPA-specific UX bolts on later.
- IAB TCF v2.2 framework — heavy, vendor-specific. Skip until an ad-tech use case demands it (most B2B SaaS don't).

---

## Privacy dashboard — **Phase A.5**

**Why last in Phase A**: composes everything above (consent A.4 + acceptance history A.2 + sub-processors A.3 + RGPD core + sessions). Today RGPD/security/sessions cards are scattered across `/settings/account`. Users (and auditors) want ONE place. Refactor-only — reuses existing cards.

- [ ] `/settings/privacy` page — composes existing components: `<DataExportCard />` (rgpd) + `<RgpdDeletionCard />` (rgpd) + `<ConsentSettings />` (A.4) + `<ActiveSessionsCard />` (security) + `<PolicyAcceptanceCard />` (A.2) + `<DataSourcesCard />` (lists A.3 sub-processors that hold this user's data with last-sync timestamp).
- [ ] Top-right: timestamp "Last data export: never / 2026-04-12", direct download link if export still valid (R2 signed URL).
- [ ] `/settings/account` slims down to identity + security after the move (rectification fields from A.1 stay there, RGPD cards relocate).
- [ ] Add to `SETTINGS_TABS` source with `requires` capability + `requiresOrg: false` (personal scope).

---

## End-to-end gates — Playwright + Lighthouse a11y CI — **Phase A.6**

**Why last in Phase A**: closes regression-proof gates over (1) the full legal chain — deletion silently leaving orphans = compliance theatre, (2) WCAG 2.1 AA — EAA non-negotiable since 28 June 2025, accessibility regressions ship invisibly without automation. Bundled because both gates run in CI on the same Playwright runner.

**Playwright legal-chain scenarios**:

- [ ] Playwright runner in `e2e/` at repo root (decide at scaffold time vs `apps/app/e2e/`).
- [ ] **Scenario 1 — Sign-up + consent + rectify**: sign up → A.4 banner → reject all → re-open settings → grant analytics → A.1 rectify name + email → re-verify email link.
- [ ] **Scenario 2 — Export**: request export → fetch download → verify JSON shape includes profile + memberships + sessions + consents.
- [ ] **Scenario 3 — Delete + grace + cancel**: request delete → cancel during grace → verify state.
- [ ] **Scenario 4 — Delete + grace expired + wipe**: request delete → simulate grace expiry (DB-time travel via test helper) → run cron → verify (a) user fields anonymized, (b) `member` rows anonymized, (c) audit log retains the chain (deferred until Phase C.2 audit-log).
- [ ] **Scenario 5 — Sole-owner preflight**: org with sole owner blocks deletion until transfer; transfer flow unblocks, deletion succeeds.
- [ ] **Scenario 6 — NIST password baseline**: sign-up rejects 8-char password without MFA; rejects HIBP-pwned password; accepts 15-char; accepts 8-char post-MFA-enrollment.

**Lighthouse a11y CI (WCAG 2.1 AA — EAA Art. 9 EN 301 549 v3.2.1)**:

- [ ] **Lighthouse CI** runs on every PR against a representative page set (`/`, `/sign-in`, `/sign-up`, `/settings/account`, `/settings/privacy`, `/legal/data-rights`, `/legal/accessibility`). Budgets: a11y score = 100, perf >95, best-practices >95, SEO >95.
- [ ] **`@axe-core/playwright`** integration in each Playwright scenario — `await injectAxe(page); await checkA11y(page)` after every navigation. Zero violations of severity `serious` or `critical` blocks merge.
- [ ] **Reduced-motion respect** — test that `prefers-reduced-motion: reduce` disables the view-transition theme toggle and any animation > 100ms.
- [ ] **Keyboard-only navigation** scenario — tab through `/sign-in` form, submit via keyboard only, verify focus trap on modals.
- [ ] **Screen-reader landmark coverage** — every page has exactly one `<main>`, one `<h1>`, semantic landmarks (`<header>`, `<nav>`, `<footer>`). Already enforced by CLAUDE.md rule 12; CI codifies it.

**CI gate**: failing legal-chain OR a11y blocks merge to `main`. Runs against ephemeral Postgres (port 5435 to avoid clashing with dev `5433`). Lighthouse stores trend data so a regression is visible in the PR comment.

---

## Security perimeter — rate-limit + CSP + CSRF — **Phase C.1**

**Why bundled**: three hardening layers any public endpoint needs. Shipping them together avoids a 3-pass review of every route. Currently zero rate-limit, default-permissive CSP from `secureHeaders()`, CSRF gated by SameSite-only.

### Rate limiting + abuse prevention

**Decided shape**:
- **Sliding window** (not token bucket — simpler, no over/under-charge edge cases at boundaries).
- **Storage**: Postgres (existing infra) via `drizzle-orm` `@packages/drizzle/src/services/rate-limit.service.ts`. Redis only if/when scale demands it (rule 14, second-occurrence trigger).
- **Per-route policy**: `requireRateLimit({ key: (c) => c.var.userId ?? c.req.header("CF-Connecting-IP"), windows: [{ ms: 60_000, max: 60 }, { ms: 3600_000, max: 600 }] })` — multi-window stack, fails fast on tightest.
- **Always responds 429 with `Retry-After`**, never 5xx.
- **Auth-burst surface** (sign-in / forgot-password / verify-email submit / 2FA submit / magic-link request): tighter window — `5/15min/IP` baseline.

- [ ] Middleware `apps/api/src/shared/middleware/rate-limit.middleware.ts` + factory.
- [ ] DB table `rate_limit_window(key, windowStart, count)` with composite PK `(key, windowStart)` and TTL cleanup cron (sweep older than longest window).
- [ ] Compose on auth-burst routes via BetterAuth's `additionalRoutes` hook (or override).
- [ ] Captcha hook (Turnstile / hCaptcha free tier — provider-agnostic via `ICaptchaService` port) — invoked when `requireRateLimit` enters "near-cap" state (>80% of window). Optional, env-flagged.
- [ ] Front error UX: 429 toast with countdown using `Retry-After` header.

### Content-Security-Policy strict (no `unsafe-inline`)

**Why**: `secureHeaders()` ships a permissive CSP by default — sufficient until any clone adds a tracker / chat widget / payment iframe and gets XSS'd. SOTA 2026 = strict CSP with per-request nonce + Trusted Types where supported.

- [ ] Hono middleware `apps/api/src/shared/middleware/csp.middleware.ts` — generates per-request nonce (`crypto.randomUUID()`), injects into HTML response (`<script nonce="...">`), sets `Content-Security-Policy: script-src 'self' 'nonce-<...>' 'strict-dynamic'; style-src 'self' 'nonce-<...>'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`.
- [ ] Vite SSR / static integration — TanStack Router serves the SPA shell; nonce threaded into the HTML template at request time.
- [ ] **Report-only mode in dev** (`Content-Security-Policy-Report-Only`) → enforced in prod. Reports hit `/internal/csp-report` (signed, rate-limited, audit-logged).
- [ ] **Trusted Types** (`require-trusted-types-for 'script'`) — graceful degradation on Firefox (no support yet), enforced on Chromium / Edge / Safari 17+.

### CSRF protection on non-BetterAuth POST routes

**Why**: BetterAuth handles CSRF on its routes via `SameSite=lax` + tokens. Custom POST routes (uploads `confirm`, `internal/*`, future business writes) currently rely on SameSite alone — fine for browser-origin requests but the day a clone exposes a route to a same-site iframe / extension origin, the protection is gone.

- [ ] **Double-submit cookie pattern** for non-BetterAuth POST/PUT/PATCH/DELETE — sets `__Host-csrf` cookie on first GET, checks `X-CSRF-Token` header matches on subsequent mutations.
- [ ] Middleware `apps/api/src/shared/middleware/csrf.middleware.ts` composed by default on every non-auth-plugin mutation route. Internal signed routes (`/internal/*`) exempt — already authenticated via HMAC.
- [ ] App side: `api-client.ts` reads cookie, injects header automatically. `customFetch` slot already exists, no per-call change needed.

---

## API tokens / Personal Access Tokens — **Phase C.4**

**Why**: any B2B SaaS exposes its API to customer systems. PATs are the standard primitive (OAuth-app flow comes later if needed). Without them, customers integrate via screen-scraping or session-cookie-stealing — both bad.

- [ ] DB schema `api_token(id, userId FK, organizationId FK nullable, name, hashedToken, scopes jsonb, lastUsedAt, expiresAt nullable, createdAt, revokedAt nullable)`. Token shown ONCE at creation, hashed (sha256 + per-row salt) at rest.
- [ ] Generation: `clean_<base58url-32>` prefix-tagged for grep / leak detection (GitHub secret scanner registers `clean_` prefix).
- [ ] Scopes — typed const `API_SCOPES = ["read:profile", "write:profile", "read:uploads", "admin"] as const`. Per-token subset. Wildcard `*` only for owner-level tokens, gated by `requireOrgPermission({ apiToken: ["create:wildcard"] })`.
- [ ] `requireApiToken` middleware (alternative to `requireAuth`) — accepts `Authorization: Bearer clean_<…>`, hashes incoming, compares, sets `c.var.user` + `c.var.tokenScopes`.
- [ ] `/settings/tokens` UI — create (name + scope picker + optional expiry), list (last-used timestamps), revoke. Created token shown ONCE in modal (copy-to-clipboard, "I've saved it" closes), never persisted client-side.
- [ ] Audit-log entries: `api_token.created`, `api_token.revoked`, `api_token.used` (sampled — log first use per day per token, not every request).
- [ ] Rate-limit with per-token key (Phase C.11 dependency).

---

## Outbound webhooks — **Phase C.5**

**Status**: **API + worker shipped** via event-driven foundation. UI front (`/settings/webhooks`) and `webhook.test` event remain.

**Why**: customer integrations need real-time event delivery from the SaaS. Polling is dead. Standard B2B primitive — every Stripe / Linear / GitHub clone has it.

**Decided shape**:
- **HMAC-SHA256 signing** with rotatable per-endpoint secret. AEAD-encrypted at rest (`@noble/ciphers` XChaCha20-Poly1305 + HKDF per-org sub-key from `WEBHOOK_MASTER_KEY` env var).
- **Retry policy**: decorrelated jitter (AWS spec, `apps/api/src/shared/jitter.ts`) on paliers ~1m/5m/30m/2h/12h, then dead-letter after 5 attempts. Total window ~14h.
- **Idempotency-Key per delivery** = `<eventId>:<endpointId>` (UNIQUE constraint) so retries are safe customer-side.
- **Dead-letter visible in API** — `GET /settings/webhooks/:id/deliveries?status=dead_letter`. UI page deferred.
- **Replay** — `POST /settings/webhooks/:id/deliveries/:deliveryId/replay` re-enqueues with fresh idempotency key.

- [x] DB schema `webhook_endpoint(id, organizationId FK CASCADE, url, secretCipher, eventTypes text[], enabled, createdAt, updatedAt)` + `webhook_delivery(id, endpointId FK CASCADE, outboxEventId FK RESTRICT, eventType, payload jsonb, status: pending|success|failed|dead_letter, attempts, nextAttemptAt, lastError, lastResponseStatus, idempotencyKey UNIQUE, createdAt)`.
- [x] Dispatcher: `WebhookFanoutSubscriber` (built-in outbox subscriber, hard-coded in `OutboxDispatcher`) — for each dispatched outbox event, queries enabled endpoints WHERE `eventTypes` matches AND `organizationId` scope-matches, INSERT N `webhook_delivery` rows with `ON CONFLICT (idempotencyKey) DO NOTHING`. Independent `WebhookDeliveryWorker` (poll 5s, `FOR UPDATE SKIP LOCKED LIMIT 50`) drains pending + retry-due deliveries, decrypts secret via AEAD, signs HMAC `t=<unix>,v1=<hex>` (Stripe-style), POSTs with 30s timeout, updates status with decorrelated jitter.
- [ ] `webhook.test` event type — sent on endpoint creation, surfaces immediate "is the URL reachable" feedback in UI.
- [ ] `/settings/webhooks` UI front — list + create + edit + delete + view deliveries + replay. **API ready** at `apps/api/src/modules/webhooks/routes.ts` (gated `requireOrgPermission({ webhooks: ["read"|"write"] })`). Plaintext secret returned **once** at creation (Stripe-style).
- [ ] Public `<EventTypesTable />` page enumerating all events the SaaS emits — read from `packages/events/src/event-types.ts` (29 events catalogued).

**Deferred**:
- Webhook proxy (Svix-style) for managed reliability — host-it-yourself first, evaluate Svix when delivery volume passes 10k/day.

---

## SSO SAML/OIDC + SCIM provisioning — **Phase C.7**

**Why**: single biggest enterprise-tier price multiplier ($10-30k/deal, recurring). Every B2B SaaS targeting >500-employee customers gets blocked at procurement without SSO + SCIM. BetterAuth ships an `sso` plugin (late 2025); SCIM is a thin REST endpoint on top.

**Architecture**:

- **`sso` plugin enabled** in `auth.ts` — supports SAML 2.0 + OIDC. Per-org config: SP entity ID, IdP metadata URL, attribute mapping (email, name, groups).
- **SCIM 2.0 endpoint** mounted at `/scim/v2/*` (RFC 7644) — accepts bearer-auth tokens scoped per-org, exposes `Users` + `Groups`. Just-in-time vs scheduled provisioning both supported (Okta/Azure AD push users).
- **Per-org configuration UI** at `/settings/sso` — admin/owner only (`requireOrgPermission({ sso: ["configure"] })`). Upload IdP metadata XML, test SSO round-trip, enforce-SSO toggle (when enabled, password login disabled for the org).
- **Audit log** every SSO event (`sso.login.success`, `sso.login.failure`, `scim.user.created`, `scim.user.deactivated`) with `retention: compliance`.

- [ ] Enable `sso()` in `auth.ts`, run Drizzle migration (adds `sso_provider` + `sso_session` tables — own schema file per Phase 0.1 split).
- [ ] `/settings/sso` UI: list configured providers, upload metadata, test, toggle enforcement.
- [ ] SCIM endpoint `apps/api/src/modules/sso/scim.routes.ts` — per-org token auth, full CRUD on `Users` + `Groups` per RFC 7644.
- [ ] **JIT provisioning** — first SAML/OIDC sign-in auto-creates `user` + `member` row scoped to the configuring org.
- [ ] **Deprovisioning** — SCIM `DELETE /Users/<id>` revokes sessions + sets `pendingDeletionUntil` (reuses RGPD grace machinery — cohérent: SCIM-deactivated user goes through the same wipe path).
- [ ] **Capability extension** — add `sso: ["configure", "enforce"]` to `@packages/access-control` statement; only `owner` role.
- [ ] **Plan gate** — Phase B.1 `PLANS.business` includes `sso: true`; `PLANS.pro` doesn't. `requireOrgFeature({ sso: true })` on the configure route.
- [ ] **E2E gate** — Playwright scenario: configure mock IdP (Keycloak in CI), sign in via SAML, verify membership + role mapping. Add to A.6 suite.

---

## In-app notification center — **Phase D.3**

**Why**: transactional emails are async; users miss them. An in-app inbox is the SaaS-default pattern (Linear, GitHub, Stripe). Persistent, mark-as-read, deep-linked.

- [ ] DB schema `notification(id, userId FK, organizationId FK nullable, kind, payload jsonb, readAt nullable, createdAt)`.
- [ ] Bell icon in app shell with unread count badge — TanStack Query subscription + `BroadcastChannel` for cross-tab sync (reuse `auth-broadcast` pattern).
- [ ] `/settings/notifications` — preferences per category (security / billing / mentions / digests), per channel (email vs in-app vs both).
- [ ] Domain event handler pattern: `OrganizationInvitationSent → InAppNotificationHandler` writes a notification row + dispatches WS-style refetch on the recipient's bell query.
- [ ] Out of scope: native push (mobile / browser). Phase F.

---

## SOC2 Type II readiness checklist — **Phase D.4**

**Why**: every enterprise procurement asks for SOC2. Vanta/Drata charge $20-40k/year to *map* your controls — most of the work is "do you actually have these controls". The boilerplate ships them; this section is the **map** so any auditor can tick boxes in 1h instead of a 2-week discovery.

**Pure documentation** — `docs/SOC2-CHECKLIST.md` mapping each shipped item to the relevant Trust Services Criteria. Updated as Phases C/D items ship.

- [ ] **CC6.1 Logical access** — auth (BetterAuth + 2FA + passkeys), capability-based authz (`@packages/access-control`), session management, password policy (Phase A.1 NIST baseline). Evidence: code reference + audit log entries.
- [ ] **CC6.2 User registration & deregistration** — sign-up flow + RGPD deletion + SCIM (Phase C.7 deprovisioning).
- [ ] **CC6.3 Privileged access** — Admin plugin (Phase C.3) + impersonation audit + role separation (platform `admin`/`support` vs org `owner`/`admin`/`member`).
- [ ] **CC6.6 Encryption** — TLS 1.3 in transit (Cloudflare/host), at-rest (Postgres + R2 native), secret management (env vars, never in git).
- [ ] **CC6.7 Restricted access to data** — `ScopedRepository` rule 18, port-level scoping survives every transport.
- [ ] **CC7.1 Detection of security events** — CSP report endpoint (Phase C.1), error tracking (Phase D.1), rate-limit triggers (Phase C.1).
- [ ] **CC7.2 Audit log** — Phase C.2, append-only, `compliance` retention 7y.
- [ ] **CC7.3 Incident response** — runbook in `docs/INCIDENT-RESPONSE.md`, status page (Phase D.1) + audit log + admin tools.
- [ ] **CC7.4 Recovery from incidents** — backups + restore-tested (Phase 0.3), RPO/RTO documented in `docs/DISASTER-RECOVERY.md`.
- [ ] **CC8.1 Change management** — semantic-release flow, conventional commits, PR review (CODEOWNERS), CI gates (Biome, knip, jscpd, type-check, Phase A.6 E2E + a11y).
- [ ] **A.1 Availability** — health probes (Phase 0.2), monitoring + error tracking (Phase 0.4), SLO dashboards + status page (Phase D.1).
- [ ] **C.1 Confidentiality** — sub-processor list (Phase A.3), DPA (Phase A.3), encryption.
- [ ] **P.x Privacy** (if SOC2 + Privacy add-on) — RGPD core, consent (A.4), rectification (A.1), erasure cascade.

**Companion docs** (referenced from the checklist):

- [ ] `docs/INCIDENT-RESPONSE.md` — severity tiers, on-call rotation template, comms templates (status page + email + customer notice within 72h per NIS2/GDPR).
- [ ] `docs/SECURITY.md` — `security@<domain>` reporting alias, PGP key, response SLA, hall of fame template, scope (in scope: this app + API + admin; out: third-party sub-processors).
- [ ] `docs/NIS2-CHECKLIST.md` — NIS2 readiness when a clone passes ≥50 employees / €10M revenue (Annexe II "important entity"): incident reporting 24h/72h/1-month, supply-chain risk mgmt, MFA/encryption baseline, governance accountability.

---

## Status page + SLO dashboards + alerting — **Phase D.1**

**Why now (after Phase C ships customer-facing surfaces)**: Phase 0.4 already ships error tracking, OTel tracing, Prometheus `/metrics`. What's missing is the **customer-facing trust layer** (public status page) and the **operator-facing aggregation layer** (SLO dashboards + alerting policies). These depend on:
- Months of `/metrics` data accumulated since Phase 0.4 (so SLO baselines are realistic, not invented)
- Audit log from Phase C.2 (incident timeline correlation)
- Admin from Phase C.3 (incident-creation UI in admin)
- Customer-facing surfaces from Phase C.4 / C.5 (PATs, webhooks — the surfaces customers actually monitor)

Shipping a status page before there are customer integrations is theatre.

### Public status page

**Why**: trust signal for enterprise procurement; SOC2 §A.1 availability monitoring evidence; reduces "is it down?" support tickets. Self-hosted (no Statuspage/Atlassian SaaS dependency — rule "100% gratuit, zéro SaaS tiers obligatoire").

- [ ] **Cachet self-hosted** (FOSS, PHP — runs on a tiny VPS or Cloudflare container) OR a maison Astro static site (lighter, already aligned with Phase E.2 stack — decide at scaffold time).
- [ ] `status.<APP_DOMAIN>` subdomain — separate cert, separate deployment, **never** the same host as the app (must stay up when app is down).
- [ ] **Components tracked**: API (`/livez` probe from Phase 0.2), App (Vite static), DB (cron pings `/readyz`), Storage (R2 `HeadBucket`), Email (Resend status mirror), Billing (Stripe status mirror once Phase B ships).
- [ ] **Incident workflow** — admin (Phase C.3) creates incident → posts updates → resolves. Audit-logged (Phase C.2). Tied to Sentry alerts (Phase 0.4) — a Sentry alert can auto-open an incident draft.
- [ ] **External uptime monitor** — UptimeRobot or BetterStack free tier hits `/livez` every 60s from 3 regions, posts to status page on failure. Independent of internal obs (avoids "the monitoring is down too" failure mode).
- [ ] **RSS / email subscription** for status updates — Cachet ships this; if maison-Astro, hook into Resend audience.
- [ ] Linked from `/legal/data-rights` + footer + Phase D.4 SOC2 readiness checklist.

### SLO dashboards (Grafana)

**Why**: Phase 0.4 already exposes `/metrics` Prometheus. Without dashboards on top, the data accumulates blind. SLOs (Service Level Objectives) translate raw metrics into "is the product healthy from a user perspective", which is what alerting fires on.

- [ ] **Grafana self-hosted** (Docker, free) OR Grafana Cloud free tier (10k series). Scrapes `/metrics` from Phase 0.4 + Sentry API (errors). Removable with the same contract as Phase 0.4 — Grafana isn't wired to anything inside the app.
- [ ] **Default SLO dashboards** shipped as JSON in `docs/grafana/`:
  - **Availability SLO** — `(1 - errors_5xx / total_requests) * 100`, target 99.9%. Burn-rate alert at 14.4× (1h window) and 6× (6h window) — Google SRE recommended.
  - **Latency SLO** — p95 < 500ms, p99 < 2s on critical paths (sign-in, dashboard load, settings save). Alert when p95 > target for 5min.
  - **Error budget** — gauge showing how much budget remains in the rolling 28d window. Cross-team visibility for "are we shipping too fast".
- [ ] **Per-module dashboards** — each module exports counters (`rgpd.deletion.requested`, `uploads.confirmed`, etc.), dashboards group by module. New module ships with its dashboard JSON in `apps/api/src/modules/<x>/grafana/` (cohérent vertical-slice).
- [ ] **Removable**: Grafana lives outside the app entirely. Removal = stop the Grafana instance + delete `docs/grafana/`. Nothing in the app depends on it.

### Alerting policies

**Why**: error tracking (Phase 0.4) catches errors; SLO dashboards (above) measure health; **alerting routes both into the right human's pocket at the right escalation level**. Without alerting policies, alerts go to `#alerts` Slack and get muted within a week.

- [ ] **Sentry → Slack/PagerDuty/Discord** integration — already supported by Sentry SaaS, configured via `docs/OBSERVABILITY.md` recipes. P1 (`status: fail` on `/readyz`, `>= 500` error rate spike) → PagerDuty + page on-call. P2 (single 5xx, performance regression) → Slack `#alerts` only.
- [ ] **Alert routing rules per environment** — staging fires to Slack only (no page); prod fires to PagerDuty. Configured via Sentry projects, not hardcoded.
- [ ] **Alert deduplication / fingerprinting** — one Sentry issue = one ongoing incident, not 1000 pages. Sentry handles this natively, but document the fingerprint customization (group by `requestId`'s root cause, not by stack frame).
- [ ] **Runbooks linked from alerts** — every alert message includes a link to `docs/runbooks/<alert-name>.md`. Pre-populate runbooks for the top 5 SLOs (DB down, Sentry overflow, R2 unreachable, Resend down, signup spike). Sentry alert templates support markdown links.
- [ ] **Alert fatigue audit, monthly** — script reads Sentry alert history, lists alerts that fired but were ignored / muted / quickly resolved. Output → `docs/runbooks/INCIDENT-LOG.md`. Forces pruning.

---

## OpenAPI schema docs — **Phase D.2**

**Why**: the moment Phase C.12 (PATs) ships, customers will integrate. They need typed docs. Manual maintenance = drift = support tickets.

- [ ] `@hono/zod-openapi` middleware to auto-derive OpenAPI 3.1 spec from existing `zValidator(...)` calls + route registrations.
- [ ] `/api/docs` route serves Scalar UI (lightweight, Stripe-aesthetic).
- [ ] `/api/openapi.json` raw spec for Postman / Insomnia / OpenAPI generator import.
- [ ] CI gate: spec drift check (any change to a route's request/response shape WITHOUT a docs comment update fails the build — promotes intentional API evolution).

---

## Capacitor mobile shell — **Phase F.1**

**Why**: BetterAuth `bearer()` plugin is already enabled, app uses TanStack Router (works in Capacitor). Mobile is 80% wrapping the existing build, not a rewrite.

- [ ] `apps/mobile/` — Capacitor 7 wrapper, points at the `apps/app` build output. iOS + Android targets.
- [ ] Bearer auth flow: `authClient` configured with `bearer` instead of cookie storage (Capacitor secure storage plugin holds the token).
- [ ] Native plugins: push (FCM/APNS via `@capacitor/push-notifications`), biometrics (`@capacitor-community/biometric-auth` for app-unlock guard), share sheet, camera (for avatar capture).
- [ ] Deep links — Universal Links / App Links route to `/<path>` opening the app, fallback to web. Handles auth callbacks (magic-link, verify-email) inside the app.
- [ ] Build pipeline: EAS-style on a self-hosted runner OR Fastlane lane. CI emits IPA + APK on tagged release.
- [ ] React Native explicitly rejected (user preference — Capacitor only).

---

## Feature flags / experiments — **Phase F.2**

**Why**: decouples deploy from release. Roll out features per-org, per-plan, per-percentage. Rollback without redeploy.

- [ ] **GrowthBook self-hosted** (FOSS, Postgres-backed, edge-evaluable). Rejected: LaunchDarkly (paid), Unleash (heavier UI), ConfigCat (vendor lock).
- [ ] `useFlag("checkout-v2")` hook — reads from local flag bundle (CDN-cached + 5-min TTL). Server middleware `requireFlag(name)` for API-level gates.
- [ ] Targeting: `userId`, `organizationId`, `plan` (Phase B.7 dependency), `email` domain, `country` (from CF-IPCountry).
- [ ] Flag inventory in code: typed `FLAGS = { "checkout-v2": "Phase 2 of checkout redesign", ... } as const` — bumps on PR.
- [ ] Audit-log entries on flag mutation (`flag.toggled`, `flag.killed`).

---

## Billing — Stripe via the BetterAuth plugin — **Phase B.1**

**Why**: `@better-auth/stripe` (official, late 2025) wraps customer creation, subscriptions, customer portal, webhooks, DB sync. No more 600 lines of hand-written Stripe glue.

**Pricing model (GitHub / Vercel-aligned)** — the decided shape:

| Org type | Plan | Members | Other | Price |
|---|---|---|---|---|
| Personal | structural (always free, never billed) | 1 (the user) | exempt from every quota | $0 |
| Team #1 (per user) | Free | 3 | basic | $0 |
| Team #2+ or upgraded | Pro | unlimited | full feature set | per-seat $X/mo |
| Team — Business | Pro+ | unlimited | + SSO / SCIM / audit | per-seat $Y/mo |

The constraint **"max 1 free team org per user"** is the only quota gate enforced at create-org time. Personal is invisible to the count (slug pattern `personal-*` already in `auth.ts`).

**Architecture**:

- **Subscription scoped per `organizationId`** — `referenceId` in the Stripe plugin = orgId. `authorizeReference` checks the calling user is owner of the target org. Members inherit the active org's plan.
- **Plan stored in `organization.metadata.plan`** (BetterAuth supports `metadata` natively) — webhook-synced, never hand-written. `metadata.plan` defaults to `"free"` on org creation.
- **Plans config = typed const** (no DDD): `apps/api/src/billing/plans.ts` exports `PLANS = { free, pro, business } as const` with `displayName`, `maxMembers`, `priceId` (env-driven). Single source of truth.
- **Entitlements layer** (rule 14 promotion of `requireAuth` shape):
  - API: `requireCreateOrg` middleware (counts user's non-personal free orgs → 402 `BILLING_PAYMENT_REQUIRED` if ≥ 1). `requireSeat(orgId)` middleware composed on `invite-member` (refuses when `members.count >= plan.maxMembers`).
  - App: `useEntitlements()` hook (reads active org + plan, exposes `canCreateFreeOrg`, `canInviteMember`, `seatsRemaining`).
- **Backend gate is authoritative; UI gate is UX courtesy** — both ship together.

**Tasks**:

- [ ] Install `@better-auth/stripe` + the `stripe` SDK + `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_PRO` / `STRIPE_PRICE_BUSINESS` in `apps/api/common/env.ts` (zod-validated)
- [ ] `apps/api/src/billing/plans.ts` — `PLANS` const, `PlanId` type, `entitlementsForPlan(plan)` helper. Pure config, zero runtime.
- [ ] `auth.ts`: declare `stripe()` plugin with `subscription: { enabled: true, plans, authorizeReference }`. Webhook auto-mounted at `/api/auth/stripe/webhook`. `databaseHooks.organization.create.after` defaults `metadata.plan = "free"`.
- [ ] `requireCreateOrg` middleware (`apps/api/src/modules/billing/infrastructure/middleware/billing.middleware.ts`) composed on `auth.api.organization.create` interceptor — when user already owns ≥ 1 free non-personal org, throw 402.
- [ ] `requireSeat` middleware composed on org member-invite flow (front route or auth-plugin override).
- [ ] `useEntitlements()` hook (`apps/app/src/features/billing/hooks/use-entitlements.ts`) reading active org + plan from existing queries.
- [ ] `/settings/billing` UI: current plan, members usage (`X / Y` with progress), `Upgrade to Pro` button → `authClient.subscription.upgrade({ plan, referenceId: orgId })` (opens Stripe Checkout), `Manage billing` button → `authClient.subscription.billingPortal({ referenceId: orgId })`.
- [ ] **Plan picker dialog** at create-org when user already has 1 free team org — Free disabled with "Upgrade an existing org or pick Pro", Pro / Business actionable. On selection: Stripe Checkout with `referenceId: <orgId>` (org pre-created in `pending` state, plan attached on `subscription.created` webhook).
- [ ] `<PricingTable />` component (3 tiers, currentPlan highlighted, CTA per tier).
- [ ] **Cross-tab sync**: webhook → org metadata change → next tab refresh picks it up via `cookieCache` 5-min refresh. Force-refresh path: `broadcastAuthChange()` from a `subscription.updated` webhook listener if needed (unlikely — 5 min is fine).
- [ ] **Dev**: `stripe listen --forward-to localhost:3000/api/auth/stripe/webhook` documented in README + `.env.example` template (`STRIPE_*` placeholders).

---

## Feature gating & quota gating — guards layer — **Phase B.2**

**Why**: gating is *not* DDD — the rule fits in `array.includes()` / `count(*)` / config lookup. Wrapping it in aggregates + use-cases is the OpenUp anti-pattern (~6.4k LOC for what 330 LOC of config + guard would cover). Stay in pragmatic infra: typed plan config + Hono guard middlewares on the API + React hook on the app.

The **Billing** section above lays the foundation: `PLANS` config, `useEntitlements()`, `requireCreateOrg`, `requireSeat`. This section extends it for the next gating dimensions as features land.

**Shape (extension pattern)**:

- Typed quotas live in `PLANS[plan].quotas` (e.g. `quotas: { uploads: 10, projects: 3, apiCallsPerMonth: 1000 }`).
- API: `requireQuota("uploads")` middleware composed per-route (same shape as `requireSeat`).
- App: `useEntitlements()` exposes `quotasRemaining` derived from current org plan + counter reads.
- Quota counters live in DB tables scoped by `organizationId`, incremented in the **same transaction** as the gated write — never an after-the-fact background reconciliation.

**Decided model**:

- Hard gates only. 402 `BILLING_PAYMENT_REQUIRED` (feature-gating) or 429 `BILLING_QUOTA_EXCEEDED` (quota-gating) the moment the cap is hit. No "warn at 80%" unless a specific feature demands it (rule 14 — promote on second occurrence).
- Quota window: aligned with the **Stripe billing period** by default (`subscription.current_period_start` → `current_period_end`). Lifetime / rolling-30d are per-resource overrides, decided when the resource ships.
- Caching: entitlements piggyback the existing 5-min `session.cookieCache`. No new cache layer.

**Deferred (decide when first consumer lands)**:

- [ ] Per-org overrides for sales-led deals (custom quotas above plan baseline) — Stripe `subscription.metadata` vs an internal `org_overrides` table. Skip until first enterprise contract.
- [ ] Quota counter reset on plan change mid-period — proration vs reset-to-zero. Stripe handles billing proration; app-side counter reset is a separate decision.

---

## Admin & impersonation — BetterAuth `admin` plugin — **Phase C.3**

**Why**: every paid SaaS needs (1) staff debugging a paying user's issue without "share your password" gymnastics, (2) ban abusive users without DB surgery, (3) read-only support access. BetterAuth ships an official `admin` plugin (late 2025) wrapping these primitives — no rolling our own. Stays infra (no DDD), gated by platform-level role, every action audited.

- [ ] `admin` plugin enabled in `auth` config (server) + on `authClient` (client)
- [ ] Drizzle schema regenerated (adds platform `role` on `user` + ban fields). Platform roles `admin` / `support` (read-only) are **distinct from org roles** (`owner` / `admin` / `member`).
- [ ] `requireAdmin` Hono middleware (mirror of `requireAuth`, throws 403 when role ∉ allowed set). Composable per-route like the rest.
- [ ] **Impersonation flow** — `authClient.admin.impersonateUser(id)` issues a short-lived impersonation session (default 1h, configurable). Original admin session preserved server-side, restored on `stopImpersonating()`. Front banner non-dismissable, distinct color (`bg-destructive`), visible on every page during impersonation. Start + stop = `recordAudit(...)` (cf audit log section).
- [ ] **Ban / unban** — `authClient.admin.banUser(id, reason)` revokes all sessions and blocks future sign-in (BetterAuth handles the session invalidation). `unbanUser(id)` symmetric. Reason captured in audit log.
- [ ] **Force password reset** — `authClient.admin.setUserPassword(id)` invalidates current sessions, sends magic-link via existing Resend template.
- [ ] Pages in `features/admin/`: `/admin/users` (list, search, filter by org / status / role), `/admin/users/:id` (detail + actions), `/admin/orgs`, `/admin/orgs/:id`.
- [ ] **Front gate** `_admin` layout route inline in `apps/app/src/router.tsx` (id `_admin`, no path) — `beforeLoad` checks `session.user.role ∈ ["admin", "support"]`, **else 404, not 403** (don't leak the existence of `/admin/*` to non-admins).
- [ ] **Never serve `/admin/*` from the public hostname in production** — separate subdomain (`admin.<APP_DOMAIN>`) or env-flagged. Reduces credential-stuffing surface on a known URL.
- [ ] No new DDD here — `admin` lives in `features/admin/` (front) + `modules/admin/` (api), guarded by `requireAdmin`. Same pragmatic shape as gating.

---

## Audit log — append-only event trail — **Phase C.2**

**Status**: **API + write-path shipped** via event-driven foundation. Admin UI page (`/admin/audit-log`) remains in Phase A admin section. Tamper-evidence intentionally deferred (columns posed, flag off).

**Why**: compliance (SOC2 §CC7.2, RGPD Art. 30, ISO 27001) requires a tamper-evident trail of who did what when. Operational value too — debugging "who changed this user's email at 3am" without `git log`-style detective work. Append-only, scoped by org, never mutated after write.

- [x] Drizzle schema `audit_log`: `id`, `organizationId` (FK, **nullable** for platform-level events like impersonation), `actorId`, `actorType` (`user` | `admin` | `system`), `action` (snake_case verb, e.g. `user.ban`, `subscription.upgrade`, `org.member.invite`, `data.export.requested`), `targetType` + `targetId` (soft FK, no DB constraint — survives delete), `metadata` (`jsonb`: diff before/after, reason, IP, UA), `createdAt`. **No `updatedAt` / `deletedAt`** — append-only is the contract.
- [x] **Helper `recordAudit(deps, { action, target, metadata })`** in `apps/api/src/shared/audit-recorder.ts` for service-level transitions; for aggregate-driven contexts the `AuditEventSubscriber` (built-in outbox subscriber, hard-coded in dispatcher) writes the row idempotently from the outbox event — zero plumbing post-clone.
- [x] **Phase-1 audited actions** — auto-emitted from BetterAuth hooks (`user.created`, `user.signed_in`, `user.account.linked`, `org.*`, `org.member.*`, `org.invitation.*`) + RGPD service (`user.deletion.{requested,cancelled}`, `user.deleted`, `user.export.{requested,completed}`). Catalog declared in `packages/events/src/event-types.ts` (29 events).
- [x] **Retention** driven by `retention` enum column (`operational` 90d / `compliance` 7y) — mapping in `packages/events/src/retention-map.ts`. Cron `POST /internal/audit-log-purge` sweeps expired `operational` rows.
- [x] Indexes: `(actorId, occurredAt DESC)`, `(targetType, targetId)`, `(action, occurredAt DESC)`, `(organizationId, occurredAt DESC)`, `(retention, occurredAt)` cover the main read paths + purge.
- [ ] Page `/admin/audit-log` (admin only, gated by `_admin.tsx`) with filters (actor, action, target, range). Each row expandable to show `metadata` diff. **API ready** — `GET /admin/audit-log` (gated `requireOrgPermission({ auditLog: ["read"] })`).
- [ ] **Tamper-evidence (deferred phase 2)** — `prevHash`/`hash` columns posed in schema; calculation off behind `AUDIT_TAMPER_EVIDENCE=false` env flag. Promote when SOC2 audit demands it (rule 14).
- [x] **Cross-cutting rule extension**: replaced by zero-plumbing event-driven model — any aggregate emitting a domain event in `EventTypes` catalog with retention `operational|compliance` is auto-audited via `AuditEventSubscriber`. Service-level transitions without aggregate use `recordAudit` helper or emit the event directly via `IOutboxRepository.enqueue`.

---

## RGPD / CCPA — data deletion + export — **shipped (referenced from Phase A)**

**Status**: **core shipped** (commits `fd3b4b7`, `bfcc15d`, `da659a0`). Lives in `apps/api/src/modules/rgpd/` (vertical slice — application service + drizzle repo + public + internal routes) and `apps/app/src/features/rgpd/` (cards + forms + hooks). What remains is in **Phase A** above (E2E gate + admin overrides + audit-log integration once the audit-log section ships).

**Why this matters**: clean-stack is a boilerplate cloned to start any SaaS. A clone deployed to EU users without Art. 17 (right to erasure) + Art. 20 (data portability) is illegal day one — fines up to 4% of revenue. The cascade was built before Billing / Audit-log / etc. landed so every future feature inherits the contract.

**Shipped surface**:

- [x] **Export endpoint** `POST /me/export` — auth-gated, sync (walks tables in-request, R2 upload, signed 7-day URL emailed via Resend `RESEND_TPL_DATA_EXPORT_*`). Rate-limit 1/24h per user via `lastExportRequestedAt`.
- [x] **Pre-flight ownership gate** `GET /me/delete/preflight` — returns sole-owner non-personal orgs blocking deletion. UI at `/settings/account` renders the blocking list with `Transfer ownership` / `Leave org` per-row CTAs; `Delete account` button stays disabled while the list is non-empty. Auto-transfer rejected on principle (no implicit refiling of legal/billing on a member without consent — mirrors Personal-org deletion posture, org R5).
- [x] **Delete endpoint** `POST /me/delete` — auth + 2FA-required (BetterAuth `twoFactor`) + server-side preflight re-check (409 `ACCOUNT_DELETION_BLOCKED` if a sole-owner org appeared between read and submit) + 7-day soft-delete grace. Cron `/internal/rgpd/process-pending-deletions` (signed) sweeps expired requests, wipes personal data (email, name, sessions, passkeys, MFA factors, R2 avatars), anonymizes `member` rows (`userId → null`, `email → deleted-<uuid>@anonymized.local`).
- [x] **Cancel-deletion UX** — sign-in during grace prompts cancel/continue dialog.
- [x] **Soft-delete confined to RGPD** — `user.deletedAt` + `user.pendingDeletionUntil` are the **only** soft-delete columns in the codebase (rule 14 — no creep elsewhere).
- [x] **Public `/legal/data-rights` page** — linked from `/settings/account`, lists what's deleted vs anonymized vs retained per legal basis.

**Remaining (tracked in Phase A above + dependent sections)**:

- [ ] **E2E Playwright gate** (Phase A.6) — sign up → upload avatar → request export → fetch export → request delete → simulate grace expiry → verify every `userId` reference is gone or anonymized. Without this gate, deletion silently leaves orphans and the compliance claim is theatre.
- [ ] **Admin overrides** (depends on Phase C.9 admin plugin) — `/admin/users/:id` triggers export-on-behalf (audited `data.export.requested` `actorType: admin`); cannot cancel a user's deletion without a documented `metadata.reason`.
- [x] **Audit-log integration** — every state transition emits an event via outbox (`user.deletion.{requested,cancelled}`, `user.deleted`, `user.export.{requested,completed}`); `AuditEventSubscriber` writes the audit row with `retention: compliance` from the catalog. Pino logging retained for ops debugging (different concern).
- [ ] **Stripe customer cleanup** (depends on Phase B.7 Billing) — wipe Stripe customer via the BetterAuth Stripe plugin during deletion; refund/proration policy is a billing-config decision.

---

## Vertical-slice layout — front + back alignment for true removability — **Phase 0.1**

**Status**: ships **right after RGPD**, before Billing. Foundational refactor — every feature shipped after inherits the "removable in 5 minutes" contract; every feature shipped before (auth, multi-tenant, storage, rgpd) is migrated as part of this section. **Rule already documented in `CLAUDE.md` `## Layout`** — this section is the migration plan, not the design.

**Why ship before Billing**: clean-stack is cloned to start *any* SaaS. Each clone keeps a different subset (a B2C product won't bill api-keys, a tool won't need members invitations, an internal app won't need marketing legal). If a *leaf feature* can't be removed cleanly — `trash` one folder + remove a `registerXxx(c, app)` line + remove route imports — the clone diverges fast. Billing is the next big feature; it must land in vertical-slice form, otherwise we re-pay the refactor cost on every subsequent feature.

**Honest scope — what is and isn't removable**:

- ✅ **Leaf bounded contexts** (rgpd, billing, api-keys, audit log, admin): vertical-slice = clean removal.
- ❌ **Cross-cutting concerns** (auth, multi-tenancy, observability, db, storage): not features, postures. Removing multi-tenancy = re-architecturing every business table's `organizationId`, ditching `ScopedRepository`, the org plugin, access-control, half the UI. No layout fixes that — it's a *clone-time* decision (future `create-clean-stack --no-multi-tenancy` CLI, or branch variants), not a `rm -rf`.

**The two failure modes today**:

1. **Front**: `features/<area>/` mixes *area* (UI shell — `settings/`, `dashboard/`) and *feature* (sub-domain — `account`, `api-keys`, `members`). Removing `api-keys` from `features/settings/_components/`, `_forms/`, `_schemas/`, `_hooks/` requires `git grep` archeology.
2. **Back**: horizontal layout (`domain/`, `application/`, `adapters/`, `routes/` at top level). A bounded context's code is sprayed across 4 sibling folders. Removing RGPD means touching `domain/rgpd*`, `application/use-cases/*-account-deletion*`, `application/dto/*deletion*`, `adapters/repositories/drizzle-rgpd*`, `routes/me.routes.ts`, `routes/internal.routes.ts`, plus DI wiring. No single-folder boundary.

**Six registration sites, no more** — adding a feature touches **only** these (and removing it untouches them):

1. API composition root (`apps/api/src/index.ts`) — `app.route("/xxx", xxxModule.routes)` (or via `registerXxxModule(app)`)
2. API DI root (`apps/api/src/di/container.ts`) — `c = registerXxx(c)`
3. DB schema barrel (`packages/drizzle/src/schema/index.ts`) — `export * from "./xxx"`
4. Capability statement (`@packages/access-control`) — extend `statement` + role policies if the feature has permissions
5. Front nav source (`SETTINGS_TABS`, `NAVIGATION_ROUTES`) — declare `requires` + `requiresOrg`
6. Email template registry (if the feature emits transactional mail)

**Migration sequence** (front first — smaller blast radius, validates naming):

- [x] **Step 0 — define the rule** in `CLAUDE.md` `## Layout` + `## App import direction` + `## App feature anatomy` + `## Don't`.
- [x] **Front step 1 — split `features/settings/`** into top-level `features/<sub-domain>/`. Underscore-private folders dropped. Account composition moved to `features/account/account.route.tsx` (composes `security/` + `rgpd/` library features).
- [x] **Front step 2 — collapse `adapters/` + `common/` + `providers/` into `shared/`**. `shared/api/`, `shared/auth/`, `shared/components/`, `shared/app-providers.tsx`, `shared/env.ts`, `shared/utils.ts`. 4 sub-folders + 2 root files; lean.
- [x] **Front step 3 — code-based routing** (Option C). `routes/` folder + `routeTree.gen.ts` + `@tanstack/router-plugin` deleted. Each feature exposes `<name>Route(parent)` factory in `<name>.route.tsx`; `apps/app/src/router.tsx` defines layouts/gates inline + assembles via `addChildren`. Library features (`security/`, `rgpd/`) stay route-less, composed by `account/`. Feature-scoped queries/mutations relocation to `features/<x>/api/` deferred (current `shared/api/queries+mutations/` remains pragmatic until duplication justifies the split).
- [x] **Back step 1 — pivot `apps/api/src/` to `modules/<context>/`**: `modules/uploads/`, `modules/rgpd/` shipped (auth + organizations stay at `apps/api/src/auth.ts` — BetterAuth singleton, no DDD). Each contains `application/{dto,services,ports for module-private interfaces}` + `infrastructure/{services,repositories}` + `routes.ts` (where applicable) + `module.ts`. `adapters/` removed; `infrastructure/` is the DDD-canonical naming. **`modules/email/` deliberately not created** — email is pure infra (no domain, no use cases, no routes), lives in `shared/services/email.service.ts` consuming `shared/ports/email.port.ts` (rule "shared kernel" in CLAUDE.md).
- [x] **Back step 2 — extract `shared/`**: `apps/api/src/shared/{middleware,ports,services}/` + process-level singletons at the root. Cross-context port interfaces (`IStorageService`, `IEmailService`) live in `shared/ports/`; cross-context impls (`ResendEmailService`) in `shared/services/`. The composed env-driven gate for `/internal/*` lives in `shared/internal-routes/internal-layers.ts` (single source — any future module exposing `/internal/*` consumes the same `internalLayers`); the whole `/internal/*` concern (signature primitives + middlewares + signed-fetch client) is grouped under `shared/internal-routes/`. `common/` deleted.
- [x] **Back step 3 — `module.ts` per context (split form)**: each `module.ts` defines an inwire `defineModule()` (typed prerequisites local to the module). `di/container.ts` chains `.addModule(emailModule).addModule(uploadsModule).addModule(rgpdModule)`. Routes stay in `routes.ts` / `internal.routes.ts` and are imported by `index.ts` directly — splitting DI from routes avoids a `module.ts → routes.ts → di/container.ts → module.ts` cycle (Biome `noImportCycles` flagged it; the SOTA is to keep DI wiring and route mounting on separate import graphs).
- [ ] **Back step 4 — split DB schema**: today `packages/drizzle/src/schema/auth.ts` is the single file (auth + multi-tenant + rgpd fields all bundled). Split into `packages/drizzle/src/schema/<context>.ts` (auth, organization, uploads when keys land in DB, rgpd, …), barrel `index.ts` re-exports. Each module owns its tables. Removing a module = remove the `export *` line + revert the migration. Last front of the vertical-slice migration; ship before Phase B (Billing) so the new `subscription` / `payment` tables land in their own file from day one.
- [ ] **Removability dry-run** on the smallest module (probably `rgpd` since fresh in memory, or `uploads` if smaller) — delete it end-to-end, run `pnpm ci:check`, document the diff in `docs/HISTORY.md` as the canonical "how to remove a feature" example.
- [ ] **Removability CI gate (phase 2 — deferred until pattern stabilizes)**: script `scripts/check-removability.ts` that picks a random module, snapshots, removes, type-checks, restores. Optional weekly cron in CI; promote to PR-blocking once stable.

**Out of scope (deferred — rule 14)**:

- Plugin manifest / runtime registry / dynamic load — explicitly rejected. Static modules with explicit registration achieve removability without the cost of indirection. Revisit only if a clone needs *runtime* feature toggling (different SKUs same codebase), which is a different problem.
- Workspace package per feature (`packages/feature-billing/`) — extra workspace overhead for a benefit (physical boundary) already met by directory + `eslint-plugin-boundaries` (deferred phase 2).
- `eslint-plugin-boundaries` rules enforcing cross-module isolation — added once the module pattern has settled (premature otherwise; tweaking rules + layout simultaneously is double pain).
- `create-clean-stack` CLI for clone-time variant selection (no-multi-tenancy, no-storage, etc.) — phase 2 once the boilerplate has 3+ adopters asking for it. README documents the manual variant for now.
- Splitting `@packages/ui` per feature — the UI package stays shared; module pivot is an *app-level* concern.

---

## i18n — TanStack Router locale routes + typed catalogs — **Phase E.1**

**Why**: most i18n stacks ship as runtime plugins that crash production with missing keys at the worst moment. Bake locale into routing (`/en/...`, `/fr/...`), enforce keys at build time, detect on the server. Zero "Translation missing" string ever shipped.

- [ ] Install `@lingui/core` + `@lingui/react` + `@lingui/cli` (chosen for CLDR plurals + AST extraction; alternative: `next-intl` if SSR streaming becomes a concern)
- [ ] Locale-aware layout route inline in `apps/app/src/router/layouts.tsx` — a `langLayout` with `path: "$lang"` parented to `rootRoute`, validating `params.lang` against the supported list (`["en", "fr"]`); every existing layout/leaf re-parents to `langLayout`
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

## Marketing site — Astro 5 + Payload 3 (self-hosted, isolated) — **Phase E.2**

**Status**: **deferred / low-priority** — not in the active queue. Triggered only the day a public marketing surface is needed (typically before opening sign-ups to a wider audience). Independent of the dependency chain above — doesn't block / isn't blocked by RGPD, Billing, Admin, Audit, i18n. Re-evaluate the stack at trigger time (CMS landscape moves fast — confirm Payload 3.x + Astro live preview is still SOTA before scaffolding).

**Why**: every SaaS clone needs a public surface (landing, pricing, blog, docs, legal) editable by a non-technical contributor without touching the app monorepo's hot path. Bolting marketing pages into `apps/app` couples release cadence to the app's CI, sacrifices SSG perf, and forces the editor through a React/Vite SPA they can't read. A standalone Astro site under `apps/site` decouples cadence, perf budget, content tooling, and deployment from the product app.

**Decided constraints** (drove every choice below — non-negotiable):

1. **100% gratuit, zéro SaaS tiers obligatoire** — no Sanity / Storyblok / Tina Cloud / CloudCannon. If a critical part of the product lives at a vendor, it's out (lock-in clause: even free-tier vendor dependencies are rejected).
2. **Live preview as-you-type** — non-tech editor must see in-progress changes (not last-published version) without clicking Save. Disqualifies Sveltia / Decap / Pages CMS / Keystatic / Outstatic / Strapi free / Ghost / WordPress headless.
3. **Total isolation from the app stack** — dedicated Postgres instance (port 5434 dev, separate provider in prod), separate deployment pipeline, separate domain. Marketing outage must never touch the app, and vice versa. Zero shared session/cookie/DB.
4. **SOTA 2026 SEO** — Core Web Vitals top-tier (Astro = only framework with >50% sites passing CWV in 2026), typed JSON-LD, sitemap/robots/RSS, dynamic OG images, canonical/OpenGraph, static client-side search.
5. **Reuses `@packages/ui` + Tailwind 4 tokens** — landing ↔ app branding cohérence, zero design drift (rule 14 — promote, don't duplicate).

**Stack** (CMS choice survived the 6-criteria web audit; only Payload 3.x passed all six):

| Layer | Choice | Why |
|---|---|---|
| Framework | Astro 5.x (`output: 'hybrid'`) | SSG by default; SSR confined to `/admin/*` and `/preview/*` routes. Best CWV pass rate of any framework in 2026. |
| CMS | **Payload 3.x self-hosted** (`@payloadcms/db-postgres`) | Only OSS CMS satisfying all 6 constraints (free, self-host, live preview as-you-type via `@payloadcms/live-preview`, Astro-compatible, non-tech UX). Backend mounted inside `apps/site` itself — single process, single deployment. |
| Database | **Dedicated Postgres** (`localhost:5434` dev, Neon free tier 3 GB or VPS in prod) | Total isolation from `apps/api` Postgres on `5433`. Backups via `pg_dump`, no cross-app migrations, no schema collisions. |
| Styling | Tailwind 4 via `@tailwindcss/vite` + `@import "@packages/ui/src/styles/globals.css"` + `@source "../../packages/ui/src/**"` | Same build pipeline as `apps/app`, shares design tokens. `@source` mandatory — Tailwind doesn't scan files outside the current project by default. |
| Components | `@packages/ui` (shadcn primitives) consumed via `@astrojs/react` islands | Branding parity with the app. Hydrate selectively (`client:visible` / `client:idle`) — most blocks stay zero-JS. |
| SEO | `@astrojs/sitemap` + `@astrojs/rss` + custom `<SEO>` component + `schema-dts` (typed JSON-LD) | `astro-seo` doesn't expose JSON-LD properly. Typed schemas catch invalid structured data at build (autocomplete + tsc errors). |
| OG images | `satori` + `@resvg/resvg-js`, generated at build via `pages/og/[slug].png.ts` | Build-time PNGs, zero runtime cost. `@vercel/og` rejected (lock-in). |
| Search (blog) | Pagefind | Binary-chunked index loaded on demand, scales to 100k pages, 0 JS at initial page load. |
| Analytics | Umami self-hosted | RGPD-native, <1KB script, no cookie banner needed. Plausible Cloud rejected (paid). |
| Hosting | Cloudflare Workers (Astro hybrid + Payload mounted) + Postgres external | Single deployment for site + CMS. Free tier covers expected traffic. Cohérent avec R2 already used in `apps/api`. |
| Runtime | Bun (build + dev) | Cohérent avec `apps/api`. Astro Bun build = production-ready in 2026. |

**Architecture**:

```
apps/site/
├── src/
│   ├── content/                     Astro Content Layer schemas
│   ├── pages/
│   │   ├── index.astro              Landing (SSG)
│   │   ├── pricing.astro            (SSG)
│   │   ├── about.astro              (SSG)
│   │   ├── blog/
│   │   │   ├── index.astro          List + Pagefind (SSG)
│   │   │   └── [slug].astro         Article (SSG)
│   │   ├── legal/{privacy,terms,data-rights}.astro
│   │   ├── og/[slug].png.ts         satori dynamic OG (build-time)
│   │   ├── admin/[...path].astro    Payload admin UI (SSR)
│   │   ├── api/payload/[...].ts     Payload REST/GraphQL handler (SSR)
│   │   └── preview/[...slug].astro  Live preview route (SSR — only Astro page that hits Payload at request time)
│   ├── components/
│   │   ├── seo/SEO.astro            canonical + OG + Twitter + JSON-LD
│   │   ├── blocks/                  Hero, Features, CTA, Pricing, FAQ, Testimonials, RichText, ImageWithText, Logos, Stats, Code
│   │   └── richtext/                Renderers for Payload Lexical output
│   ├── layouts/
│   ├── lib/payload/                 Client + generated TS types
│   └── styles/globals.css           @import @packages/ui tokens + @source cross-package
├── payload/                         Payload backend config (co-located, NOT a separate app)
│   ├── payload.config.ts            adapter postgres + livePreview + plugins
│   ├── collections/                 Pages, Posts, Media, Authors, Settings, Redirects
│   ├── blocks/                      Block schemas reused across Pages
│   └── access/                      RBAC for admin UI (admin / editor)
├── public/
├── common/env.ts                    zod-validated env (mirror of apps/api/common/env.ts)
├── astro.config.mjs                 output: 'hybrid', adapter @astrojs/cloudflare
└── package.json
```

**Workflow non-tech editor**:

1. `<site-domain>/admin` → email/password login (Payload native auth, zero external dep)
2. Edit a Page → drag/drop blocks, fill fields with previews/help text per field
3. Click **Live Preview** → split view: form left, real Astro page right, updates as-you-type via `postMessage` from `@payloadcms/live-preview`
4. **Save Draft** ou **Publish** → on Publish, Payload `afterChange` hook → Cloudflare deploy hook → SSG rebuild (~30s, granular per affected slug)
5. Production reste 100% statique sur Cloudflare CDN — `/admin/*` + `/preview/*` are the only SSR routes

**Tasks**:

- [ ] **Docker**: add `postgres-site` service to root `docker-compose.yml` (image `postgres:17`, port `5434:5432`, volume `postgres-site-data`, isolated from existing `postgres` service — distinct credentials, no shared network alias)
- [ ] **Scaffold `apps/site`**: Astro 5 + Tailwind 4 + integrations `@astrojs/react`, `@astrojs/mdx`, `@astrojs/sitemap`, `@astrojs/rss`, `@astrojs/cloudflare`. Link `@packages/ui` + `@packages/typescript-config`. `output: 'hybrid'`.
- [ ] **Turbo pipeline**: register `dev` (interruptible), `build` (depends on `^build`, outputs `dist/**`, `.astro/**`), `preview`, `db:push:site`, `db:migrate:site`. Add `.astro/` + `dist/` + `apps/site/payload-types.ts` to `.gitignore` ? (decide on generated types commit policy at scaffold time).
- [ ] **Env** `apps/site/common/env.ts` (zod-validated) — `DATABASE_URI` (port 5434 dev), `PAYLOAD_SECRET` (32-byte random), `PUBLIC_SITE_URL`, `PUBLIC_APP_URL`, `CLOUDFLARE_DEPLOY_HOOK_URL`. `.env.example` documenté avec instructions de génération du secret.
- [ ] **Payload 3.x setup**: `payload.config.ts` with `@payloadcms/db-postgres`, `@payloadcms/richtext-lexical`, `@payloadcms/plugin-seo`, `@payloadcms/plugin-redirects`, secret, admin route `/admin`, `serverURL`, `cors`, `csrf`. Mounted in Astro SSR routes via Payload's standalone handler — single Bun process serves Astro + admin + Payload API.
- [ ] **Collections**:
  - `Settings` (singleton — site name, social links, default SEO, deploy hook URL, footer columns)
  - `Pages` (slug, title, blocks[], SEO group, drafts/versions enabled, live preview enabled)
  - `Posts` (slug, title, excerpt, hero image, content Lexical, SEO group, author FK, publishedAt, tags)
  - `Media` (R2 adapter via `@payloadcms/storage-r2` if reusing existing R2, else local + cf-images)
  - `Authors` (name, bio, avatar, socials)
  - `Redirects` (from path, to path, type 301/302) — auto-applied via Astro middleware reading the collection
- [ ] **Block schemas reused across Pages**: `Hero`, `Features`, `CTA`, `Pricing` (linked to Billing plans config when shipped), `FAQ`, `Testimonials`, `Logos`, `RichText`, `ImageWithText`, `Stats`, `Code`. Each block = a Payload `Block` + an Astro renderer in `components/blocks/<Block>.astro`. Adding a block = touch 2 files.
- [ ] **Astro layout + `<SEO>` component**: title template, canonical (default `Astro.url.href`), OG, Twitter, JSON-LD via `schema-dts` (Organization on root, Article on blog posts, BreadcrumbList where applicable). View Transitions enabled.
- [ ] **Dynamic page route `[...slug].astro`**: SSG, `getStaticPaths` queries Payload at build, renders blocks via `<BlockRenderer block={block} />` switch.
- [ ] **Blog**: `blog/index.astro` (list + Pagefind UI), `blog/[slug].astro` (Lexical → Astro renderer, related posts, author card, share buttons), `blog/rss.xml.ts`, `blog/[tag]/index.astro` (filtered by tag).
- [ ] **Live preview route** `preview/[...slug].astro` — SSR, fetches draft content with Payload draft token, mounts `@payloadcms/live-preview` subscriber, page DOM updates via `subscribe()` callbacks at every keystroke from the admin iframe. Auth-gated (only logged-in Payload admin can hit it).
- [ ] **OG images** `pages/og/[slug].png.ts` — satori + resvg, builds PNG per page/post, cached as static asset. Mark `@resvg/resvg-js` as `external` in Vite config (gotcha 2026).
- [ ] **Webhook revalidation**: Payload `afterChange` hook on `Pages` / `Posts` / `Settings` / `Redirects` → fetches `CLOUDFLARE_DEPLOY_HOOK_URL` → triggers SSG rebuild. Granular per affected slug if Cloudflare Pages incremental rebuild API allows (else full rebuild — acceptable at our scale).
- [ ] **Cross-link app**: header/footer `<NavLink>` to `PUBLIC_APP_URL` ("Sign in", "Get started"). Reuses `@packages/ui` `NavLink` primitive (rule 11). Auth state of the app NOT shared (zero session leak between domains — site never reads `apps/api` cookies).
- [ ] **Pagefind** integration: post-build script indexes `dist/`, generates `/pagefind/*` bundle, search UI mounted on blog index (Astro Island, `client:visible`).
- [ ] **Umami self-host**: separate Cloudflare Worker or container (own roadmap subtask), script tag in Astro layout. Privacy-first — no cookie banner needed (no PII collected).
- [ ] **CI** `.github/workflows/site.yml` triggered on `apps/site/**` paths — type-check, build, Lighthouse CI gate (LCP <2s, CLS <0.05, INP <200ms, perf score >95). Failing perf budget blocks deploy.
- [ ] **Deploy**: Cloudflare Workers (root `apps/site`, build `bun run build`, output `dist/`). Postgres prod = Neon free tier (3 GB) ou VPS Postgres existant. Secrets via Cloudflare dashboard, jamais committés.
- [ ] **Sitemap + robots.txt**: `@astrojs/sitemap` config (changefreq per route type, priority weights, hreflang if i18n). `public/robots.txt` referencing the sitemap URL. `site` declared in `astro.config.mjs` (else URLs are relative — gotcha).
- [ ] **Legal pages**: `/legal/privacy`, `/legal/terms`, `/legal/data-rights` (cf RGPD section above). Stored as `Pages` in Payload — non-tech can update without dev.
- [ ] **Editor onboarding doc** `apps/site/README.md` — 30-line non-tech guide ("How to publish a blog post", "How to edit the homepage", "How to add a redirect"), plus 1-page dev setup section.

**Out of scope (deferred until first concrete need — rule 14)**:

- i18n on the marketing site (the app's `@lingui` stack is a separate roadmap section; the site would use Astro's native `astro:i18n` instead — different perf trade-offs for SSG).
- A/B testing — defer until product-market fit demands it; static A/B via Cloudflare Workers split routing if/when needed.
- Newsletter signup form — when adopted, route submissions to existing Resend audience (no new ESP, reuse `apps/api` mailing infra via signed webhook).
- Visual page-builder à la Storyblok with drag-drop on the rendered page — Payload provides "drag blocks in the form" + as-you-type preview; full inline page-builder rejected (would force migration to Apostrophe → Cloudflare Pages incompatible).

**Cross-cutting**:

- **Marketing-site is the only Astro deployment in the monorepo** — all other apps stay React/Vite. Don't generalize Astro elsewhere without explicit decision.
- **No imports from `apps/api` or `apps/app`** — the site is a leaf consumer of `@packages/ui` only. Cross-app coupling forbidden (would require lockstep deploys, defeats isolation contract).
- **Domain layout (decide at deploy time)**: production root `<APP_DOMAIN>` → site, `app.<APP_DOMAIN>` → app. Or reverse based on branding. Document chosen pattern in `apps/site/README.md` and `apps/app/README.md`.
- **Content backups**: nightly `pg_dump` of the site Postgres → R2 bucket (`<R2_BUCKET>/site-backups/<YYYY-MM-DD>.sql.gz`). Retention 30 days. Operational, not compliance-grade (the audit-log section's `compliance` retention doesn't apply to marketing content).

---

## Cross-cutting rules

1. **No DDD for these integrations** — `modules/<context>/infrastructure/services/*` on the api side, `features/<x>/hooks/*` + `shared/api/` on the app side. If a concept becomes domain (e.g. a `Subscription` with its own rules), promote it into `modules/<context>/domain/` then.
2. **Env validated by zod** in `apps/api/common/env.ts` (api side, pending migration to `apps/api/src/shared/env.ts`) and `apps/app/src/shared/env.ts` (app side).
3. **Webhooks**: live in the owning module's `routes.ts` (`modules/<context>/routes.ts` exposes `POST /webhooks/<provider>`), mandatory signature verification before any processing.
4. **Secrets**: never committed, `.env.local` (gitignored) + 1Password/Doppler in production.

---

## Shipped phases

Full architectural log preserved in [`docs/HISTORY.md`](docs/HISTORY.md):

- **Auth — BetterAuth (end-to-end)** ✅ Phase 1 + Phase 2 (organization plugin)
- **Multi-tenant — `organization` plugin** ✅ Phase 2 (per-org scoping, invitations, roles, slug auto-gen). **May 2026 cleanup**: dropped the `teams` sub-plugin — grouping-only without team-scoped roles or statements adds UX surface for ~zero value at this stage; can be re-enabled in two lines if a clear use-case emerges. Settings collapsed from a General/Members/Teams split to a single `Organization` tab with section-level `<Can>` gates per role.
- **Email — Resend** ✅ Phase 1 (typed templates, idempotency, retry, DNS hardening)
- **Storage — R2 + SeaweedFS** ✅ Phase 1 (presign / PUT-direct / confirm flow, owner-scoped keys)
- **RGPD core — Art. 17 + Art. 20** ✅ Phase 1 (sync export to R2, 7-day grace deletion, 2FA gate, sole-owner preflight, cancel UX, `/legal/data-rights`) — remaining items in Phase A.6 / dependent on Audit-log + Admin + Billing
- **Vertical-slice layout** ✅ Front (steps 1-3: feature split, `shared/`, code-based routing) + Back (steps 1-3: `modules/<context>/`, `shared/`, inwire `defineModule`) — back step 4 (DB schema split) outstanding
- **App shell — top-nav + ⌘K palette** ✅ (sticky header, contextual settings tabs, command palette, custom logo mark)
