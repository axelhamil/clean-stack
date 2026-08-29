# Modules

Each module is a vertical slice. Removable in minutes via a documented contract. Cross-cutting ports stay in `shared/ports/` with NoOp adapters always shipped, so dropping a module never breaks call sites.

This file doubles as a **value sheet for client proposals**. Each module is priced as "what a competent senior dev (solo or small studio) would realistically charge to wire it cleanly on a client engagement, given that the underlying libraries (BetterAuth, shadcn, Resend SDK, AWS SDK, etc.) already do 70-80% of the work."

**These are NOT inflated consultancy SOW prices.** A boilerplate doesn't replace 6 months of build-from-scratch — it replaces the wiring, the architecture decisions, the data scrubbing details, the removal contracts, the doc work. That's real value but it's bounded.

## Pricing principle

- Anchored on French/EU senior TJM €600-900/day × realistic ship time (not "with full SOW, design review, change management").
- Estimates assume the dev knows the libraries. The price is for **integrating + architecting + testing + documenting**, not for learning BetterAuth.
- Single fourchette per module, not low/high consultancy. Lower bound = experienced solo dev shipping fast. Upper bound = same dev being thorough on tests + docs.

## Primary keys for new tables

Postgres 18 (`docker-compose.yaml`) ships a native `uuidv7()` — time-ordered, so insert-heavy tables avoid the B-tree hotspot/write-amplification of random `uuidv4()` while staying globally unique. For **any new application table owned by the cloner**, default the primary key to it:

```ts
uuid("id").primaryKey().default(sql`uuidv7()`)
```

**Every existing table stays `text("id").primaryKey()`** — every PK in `packages/drizzle/src/schema/` is filled by BetterAuth, which generates its own ids on its own schema. Converting those is a BetterAuth question, not a Postgres one, and is deliberately out of scope here.

---

## Shipped modules — value already in the box (v2.0+)

| Module | Realistic value | Time |
|---|---|---|
| **Auth** (BetterAuth singleton wired Bun-native + 2FA + passkey + magic-link + bearer + customSession + email hooks idempotents) | **€800 – €1 500** | 2-3j |
| **Multi-tenant + access-control SSOT** (organization plugin, Personal org auto-creation/self-heal, capability-based predicate api/route/UI, `<Can>`, `useAuthorization`, `requireOrgPermission`) | **€1 000 – €1 800** | 3-4j |
| **Email** (Resend port + adapter, template registry typed, idempotency, retry, EU region option, SPF/DKIM/DMARC deploy doc) | **€400 – €700** | 1j |
| **Email delivery queue** (D.5) (`email_message` durable table written **inside the caller's TX**, so a queued email cannot survive a rolled-back write; `EmailDeliveryWorker` polls every 2 s, claims 300, chunks 100 into `resend.batch.send` (10 req/s ceiling, permissive batch validation); decorrelated-jitter retry with `email.delivery.exhausted` on give-up; batch-level `Idempotency-Key`; `@packages/emails` in-repo React Email templates as the SSOT with `TEMPLATE_IDS` as override; `sweep-email-messages` retention cron. No email is ever sent inline from a request path.) | **€800 – €1 400** | 2j |
| **Storage S3-compatible** (R2/SeaweedFS, three-step presign→PUT→confirm, owner-scoped key, server-verified `HeadObject` on confirm, boot-time fail-hard) | **€800 – €1 500** | 2j |
| **RGPD complet** (Art. 17 erasure with 7-day grace + Art. 20 portability + 2FA-gated + sole-owner preflight + automated cron sweep + `/legal/data-rights` Art. 13/14) | **€2 500 – €4 000** | 5-7j |
| **DDD-kit** (Result, Option, Entity, Aggregate, ValueObject, UUID v7, WatchedList, BaseRepository, ScopedRepository, IUnitOfWork avec ALS event-collector flush, BaseDomainEvent, onEvent factory, EventCollector, AppErrorException, 275 vitest cases) | **€1 500 – €2 500** | 4-5j |
| **Event-driven foundation** (transactional outbox + LISTEN/NOTIFY dispatcher in-process Bun + claim window webhook delivery + 2 built-in subscribers + 23 events auto-émis BetterAuth bridge + 5 RGPD + 3 uploads + 3 webhooks + 1 policy = 35-event catalog `packages/events` partagé api+app+workers + AEAD secrets + decorrelated jitter retry + nested-uow.run guard + request-id correlation via ALS + 3 retention sweeps HMAC-gated `/internal/sweep-*` SOTA 2026) | **€3 000 – €5 000** | 6-8j |
| **Audit log** (append-only, SOC2 §CC7.2 / ISO 27001, retention enum operational 90d / compliance 365d, env-driven sweep `/internal/sweep-audit-log`, GET /admin/audit-log gated requireOrgPermission, idempotent via outbox subscriber, prev_hash/hash columns posées pour tamper-evidence future) | **€1 500 – €2 500** | 3-4j |
| **Outbound webhooks** (CRUD endpoints /settings/webhooks gated requireOrgPermission, plaintext secret retourné une seule fois at creation, HMAC-SHA256 Stripe-style, AEAD-encrypted secrets via @noble/ciphers XChaCha20-Poly1305 + HKDF per-org, retry decorrelated jitter, dead-letter, replay endpoint, idempotency keys) | **€2 500 – €3 500** | 5-6j |
| **UI shadcn-pure + theme** (full registry + custom primitives `NavLink`, `ListRow`, `FormTextField`, `DestructiveActionDialog`, `BackupCodeList`, `QrCodeFrame`, `BrandLink`, `TextLink` + view-transitions theme toggle + typography exports) | **€600 – €1 200** | 2j |
| **App shell** (Vite + React 19 + TanStack Router file-based via `virtualRouteConfig` + `autoCodeSplitting` + intent prefetch + view transitions + AppProviders + 4 pathless gates + settings layout + command palette ⌘K + org switcher + auth devtool) | **€1 500 – €2 500** | 3-4j |
| **Monorepo tooling** (pnpm 11 + Turborepo TUI with `with: ["type-check"]` + Biome 2 + Husky + commitlint conventional + semantic-release with `breaking: true` precedence + jscpd + knip all-workspaces + zero-warning pre-push) | **€600 – €1 000** | 2j |
| **AI-pair ready** (`CLAUDE.md` root + sub-CLAUDE.md per layer auto-loaded by Claude Code + `docs/HISTORY.md` + `docs/CRON.md` + `docs/INTEGRATIONS.md` + `docs/FEATURES.md` + `docs/OVERVIEW.md`) | **€300 – €600** | 1j |
| **Health probes** (0.2) (`/livez` + `/readyz` + `/startupz` IETF format, registry pattern, graceful shutdown, asymmetric cache) | **€500 – €900** | 1-2j |
| **Backups + DR** (0.3) (daily `pg_dump` cron, R2 lifecycle 30d/1y cold, monthly automated restore-test, RPO/RTO doc, PITR doc) | **€1 000 – €1 800** | 2-3j |
| **Observability — Sentry** (0.4) (Sentry api+app removable, `IInstrumentation` port + NoOp default, RGPD scrubbing, source maps CI, release tracking — OTel + Prometheus deferred to D.1) | **€2 500 – €4 000** | 5-6j |
| **Profile + NIST 800-63B-4 password** (A.1) (rectification UI, email re-verification, avatar upload, HIBP screening, min length 15 universal — no MFA exception, ban complexity rules) | **€1 200 – €2 000** | 3-4j |
| **Privacy policy / Terms versioning** (A.2) (DB schema, `@packages/policies` version SSOT, `requireCurrentPolicies` middleware, `/legal/accept` diff view) | **€600 – €1 000** | 1-2j |
| **Compliance docs bundle** (A.3) (`/legal/sub-processors` Art. 28 — typed `SUB_PROCESSORS` const + `/legal/accessibility` EAA Art. 14 WCAG 2.1 AA / EN 301 549 + `docs/legal/DPA-template.md` + `docs/legal/DORA-annex-template.md` + `docs/legal/README.md` + command-palette links + `data-rights` cross-links. RSS change history + re-acceptance trigger deferred. 0 events.) | **€400 – €800** | 1j |
| **Cookie consent + consent management** (A.4) (device-scoped dual-layer: `cc_sid` httpOnly cookie + `consent_record` append-only; `@packages/cookie-consent` SSOT + `ConsentService` + `/consents` routes (CSRF-exempt, rate-limited) + `<CookieBanner>` CNIL Reject/Accept + `<ConsentSettings>` + `<ConsentGate category>` + `<AnalyticsScripts>` + `<LegalFooter>` + `/legal/cookies`; guest→user reconciliation at login; `CONSENT_GRANT_TTL_DAYS`/`CONSENT_REFUSAL_TTL_DAYS`. GPC/DNT requalified out of EU scope. 2 events → 42 total.) | **€1 200 – €2 000** | 2-3j |
| **Privacy dashboard** (A.5) (`/settings/privacy` UX hub: `<PolicyAcceptanceCard />` + `<ConsentSettings />` + `<DataSourcesCard />` + `<DataExportCard />` + `<SessionsCard />`. Danger tab dissolved; contextual danger zones (account + organization pages). `sub-processors.config.ts` promoted to `shared/`. 0 events.) | **€600 – €1 000** | 1-2j |
| **Billing — Stripe subscriptions + feature/seat gating** (B.1) (`@better-auth/stripe`, Checkout + Billing Portal hosted, subscription SSOT in plugin table, hybrid catalog Stripe+code via `ENTITLEMENTS`, 3 gate axes: role/seat/tier, `useEntitlements()` + `<FeatureGate>` + `<PlanGate>`, 4 compliance/operational events, free-tier degradation when key unset) | **€3 600 – €6 000** | 7-10j |
| **Quota gating** (B.2) (dormant skeleton extending B.1: `ENTITLEMENTS[tier].quotas` catalog, `requireQuota` pre-check + `reserveQuota` advisory-lock atomic gate + `countScopedRows`, `quota_usage` table + `modules/quotas/` `IQuotaUsageStore`, `useQuota()` + `<QuotaGate>`, `billing.quota.exceeded` event, knip-whitelisted) | **€800 – €1 200** | 1-2j |
| **Security perimeter** (C.1) (`rate-limiter-flexible` fail-closed on auth — IETF `RateLimit` headers, memory + Postgres dedicated-pool stores; strict CSP via Caddy nonce injection (`{http.request.uuid}`); CSRF via Origin-allowlist (Bearer exempt); S5a: per-account credential-stuffing counter, disposable-email block, HIBP breached-password telemetry. 5 `security.*` events. S5b advanced signals + S6 captcha deferred.) | **€1 200 – €2 000** | 3j |
| **Audit log front UI** (C.2) (`/admin/audit-log` operator page — cursor pagination, filters, `MetadataSheet` before/after diff, `ChainBadge`; tamper-evidence hash chain env-gated (`AUDIT_TAMPER_EVIDENCE`); `requirePlatformAdmin`; `security.operator.audit_accessed` event → 48 total at ship, 52 after C.5.) | **€500 – €1 000** | 1-2j |
| **Admin & impersonation** (C.3) (`modules/admin/` back + `features/admin-users/` + `features/admin-orgs/` front; audited ban / unban / role-change / force-password-reset / revoke-sessions; justified impersonation (reason + optional ticketRef); two-layer blocklist: BetterAuth hook + 11 `denyImpersonated` routes (incl. policy acceptance); non-dismissable banner with live countdown; transparency email to impersonated user; MFA-gated "Admin" nav → `/admin/users`; legal acceptance gate disabled during impersonation; `APP_URL` promoted to required. 7 `admin.*` events → 62 total / 57 subscribable / 5 internal.) | **€1 500 – €2 500** | 3-4j |
| **API tokens / PATs** (C.4) (`/settings/tokens` CRUD, name + scope picker + optional expiry, `denyImpersonated` on writes; `clean_` + 44-char base58 body + 6-char CRC32 checksum; HMAC-SHA256 + server pepper (`API_TOKEN_PEPPER`), pepper rotation via `API_TOKEN_PEPPER_PREVIOUS` / `API_TOKEN_PEPPER_VERSION`; `/api/v1` sub-app outside `AppType` (token-auth only, no session middleware); cascade revocation on org membership loss; `POST /api/token-scanning/github` ECDSA P-256; `visibility-map.ts` public/internal classification; 3 events → **65 total / 28 public / 37 internal**) | **€1 000 – €1 800** | 2-3j |
| **Webhooks front UI + event catalog** (C.5) (`/settings/webhooks` CRUD — per-attempt timeline drawer, one-shot secret reveal, rotate-secret dialog, send-test, auto-disabled badge; SSRF guard; dual-secret rotation (`WEBHOOK_SECRET_GRACE_HOURS`); `webhook_delivery_attempt` table; auto-disable after `WEBHOOK_AUTO_DISABLE_AFTER_DAYS`; public `/developers/events` catalog (JSON schemas, Node signature-verification snippet). 4 internal events → 52 total / 48 subscribable / 4 internal.) | **€800 – €1 500** | 2j |
| **Account recovery codes UI** (C.6) (`RecoveryCodesCard` regenerate-only + password gate + `xxxxx-xxxxx` format + copy/download; backup-code fallback on `/two-factor` (whitespace stripped, dash auto-inserted); `BackupCodeUsedNotifier` first `onEvent` handler; rate-limit on `generate-backup-codes`. 2 compliance events → 54 total / 50 subscribable / 4 internal.) | **€200 – €400** | 0.5j |

| **Notification center** (D.3) (`<Bell />` + dropdown inbox in the app shell, unread badge, read/read-all with cross-tab propagation, rows grouped by `groupKey`; `/settings/notifications` preference matrix (category × channel + email frequency) and org defaults card behind `organization:["update"]`; fan-out as an outbox subscriber inside the dispatch TX, one `INSERT ... SELECT` resolving the org-lock → user → org-default → enabled cascade in-statement, `forced` bypass for critical alerts; SSE signal stream (`pg_notify` + one `LISTEN` per instance, `fetch`+`ReadableStream` not `EventSource`) with polling only as fallback; dedup via partial unique index; 2 crons (digest flush + read-only sweep). No new event type — the catalog is consumed, so it stays **67 total / 28 public / 39 internal**.) | **€1 200 – €2 000** | 3j |
| **Enterprise SSO + SCIM provisioning** (C.7) (`@better-auth/sso` OIDC + SAML 2.0 + `@better-auth/scim`; per-org provider registration + domain verification; JIT provisioning on first sign-in; domain-based SSO enforcement across all four sign-in paths — password, sign-up, magic-link, passkey — with a "Sign in with SSO" redirect on the front instead of a dead-end error; SAML forced to SHA-256 signed assertions server-side regardless of client input; SCIM `Users` CRUD, `DELETE` as an org departure (member row only, account survives); `/settings/sso`; local Keycloak dev profile. 13 events → **80 total / 34 public / 46 internal**.) | **€5 000 – €8 000** | 10-12j |
| **i18n foundation** (E.1a) (`@packages/i18n` — `.ts … as const` catalogs (`common`, `auth`, `errors`, `emails`, `settings`) bound to `t()` through `CustomTypeOptions.resources`, so an unknown key is a `tsc` error; `i18next` + `react-i18next` retained over Lingui/Paraglide on adoption and typing evidence; locale resolved cookie → `user.locale`, **never from the URL** — zero routes re-parented; language switcher + `PUT /me/locale`; per-recipient email locale frozen on the queued row at enqueue; localized Zod / API / BetterAuth error copy through one global map; `en`/`fr` key-parity test; `<html lang>` asserted in the a11y gate. 1 event → **81 total / 35 public / 46 internal**.) | **€1 000 – €1 800** | 2-3j |

**Subtotal Core (shipped)**: **€42 600 – €71 400** of senior-dev value already in the repo on day zero. ~92-119 days of focused senior work compressed into a clone.

---

## Roadmap modules — committed value to ship

| Phase | Module | Realistic value | Time |
|---|---|---|---|
| A.6 | **E2E gates Playwright + Lighthouse a11y CI** (full legal chain, WCAG 2.1 AA gate ≥95) | **€1 200 – €2 000** | 3j |
| D.1 | **Status page + SLO dashboards + alerting** (Cachet/Astro, Grafana SLO consuming 0.4 `/metrics`, Sentry → Slack/PagerDuty, runbook-linked) | **€1 500 – €2 500** | 3-4j |
| D.2 | **OpenAPI auto-docs** (`@hono/zod-openapi`, Scalar UI at `/api/docs`) | **€400 – €700** | 1j |
| D.4 | **SOC2 Type II readiness checklist** (mapping shipped controls, Vanta/Drata-ready) | **€600 – €1 000** | 1-2j |
| E.1b | **i18n — remaining extraction** (`admin`, `webhooks`, `sso`, `billing`, `organization`, the rest of `settings`, per-locale legal content modules — catalog work on the rail E.1a already shipped) | **€600 – €1 000** | 1-2j |
| E.2 | **Marketing site** (Astro 5 + Payload 3 self-hosted, separate deploy, content modeling, blog) | **€2 500 – €4 000** | 5-7j |
| F.1 | **Capacitor mobile shell** (`apps/mobile/` wrapping `apps/app` build, bearer auth, push channel) | **€2 000 – €3 500** | 4-5j |
| F.2 | **Feature flags GrowthBook** (self-hosted, decouple deploy from release, A/B harness) | **€600 – €1 000** | 1-2j |

**Subtotal Roadmap**: **€9 400 – €15 700** committed to ship.

---

## Total value-in-box once roadmap is shipped

**Core + Roadmap = €52 000 – €87 100** of realistic senior-dev value packaged.

That's ~5.5-7 months of focused senior work compressed into a clone. Honest, defensible to clients, no inflated SOW pricing.

---

## Future commercial model — boilerplate one-time license

When clean-stack is commercialized as a product (ShipFast / Bullet Train / Makerkit positioning), the price is a **fraction of the realistic delivered value**:

- ShipFast charges €199 against ~€10-15k of value (~1.5%).
- Makerkit charges €499-999 against ~€15-25k of value (~3%).
- Bullet Train charges €1499 against ~€25-40k of value (~4%).

Applying the same ratio bands to clean-stack's €52k–€87k value:

- **1.5% floor** (ShipFast aggressive entry) → **€800 – €1 300** one-time.
- **3% market median** → **€1 500 – €2 600** one-time.
- **4% premium** (Bullet Train upper) → **€2 000 – €3 400**, only justified with included support / customization.

**Recommended initial positioning**: single tier at **€699 – €999** lifetime license, lifetime updates within current major. Reasoning:
- Anchors near Makerkit's lower tier — signals "more architecturally serious than ShipFast, less than Bullet Train premium"
- Clean round number, easy to anchor against the €52-87k value delivered ("you save 50-100× the price on day one")
- Single tier eliminates funnel friction — the whole stack is the product
- Premium tier (~€1 999) only when a course / community / 1-on-1 onboarding is included — pure license alone doesn't justify it

**À la carte module sales** are **not recommended** at the boilerplate-license stage. ShipFast-style buyers want everything; segmenting by module slows the funnel. À la carte makes sense only for a future hosted/managed iteration of clean-stack.

---

## License & redistribution

Commercial license per buyer (covers solo + team-of-≤10). Buyers can ship products built on clean-stack without restriction. They cannot redistribute the boilerplate itself or sell forks. License agreement template in `docs/legal/LICENSE-COMMERCIAL.md` (placeholder — to be populated when commercialization launches).
