# ROADMAP

Forward-looking work for clean-stack. **All SOTA 2026, outside DDD** (DDD reserved for pure business domain). Already-shipped work is logged in [`docs/HISTORY.md`](docs/HISTORY.md) ; current inventory in [`docs/FEATURES.md`](docs/FEATURES.md) (or [`docs/OVERVIEW.md`](docs/OVERVIEW.md) for the guided tour).

> **Boilerplate target**: clone → ship any SaaS without re-coding plumbing. Anything below that isn't `[x]` is friction the cloner inherits.

---

## ✅ Already shipped (key milestones)

| Milestone | When | Surface |
|---|---|---|
| Auth (BetterAuth) | — | sign-in/up, MFA, passkey, magic-link, bearer, customSession, email hooks |
| Multi-tenant + access-control SSOT | — | organization plugin, Personal org self-heal, capability-based predicate front+back, `<Can>` |
| Email (Resend port + adapter) | — | template registry typed, idempotency, retry, EU region option |
| Storage S3-compatible (R2/SeaweedFS) | — | presign→PUT→confirm, owner-scoped key, server-verified `HeadObject` |
| RGPD core (Art. 17 + Art. 20) | — | 7-day grace, 2FA-gated, sole-owner preflight, cron sweep, `/legal/data-rights` |
| App shell + ⌘K palette | — | top-nav, settings tabs, view-transitions theme, command palette |
| Vertical-slice layout | — | `features/<x>/<x>.{route,page}.tsx` + `modules/<x>/{application,infrastructure,routes,module}.ts` |
| Clone-ability bootstrap | May 2026 | `pnpm bootstrap`, SeaweedFS `storage` profile, `db:push --force`, internal packages source-only |
| **Event-driven foundation** | **May 2026** | outbox + LISTEN/NOTIFY dispatcher + 35 events (23 BetterAuth bridge + 5 RGPD + 3 uploads + 3 webhooks + 1 policy) + audit-log API + webhooks API + worker (HMAC + AEAD + decorrelated jitter retry) + retention sweeps. See [`docs/EVENTS.md`](docs/EVENTS.md) + [`docs/EVENT_PIPELINE.md`](docs/EVENT_PIPELINE.md). |
| **Phase 0 — Foundation closeout** | **Jun 2026** | health probes + backups/DR + Sentry + removability dry-run + retention sweeps + Railway reference deploy live on `main`. As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |
| **Phase A.1 — Profil + NIST password** | **Jun 2026** | `ProfileCard` + `ChangePasswordCard` + HIBP k-anonymity + min 15 chars + ban-list + 2 compliance events. As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |
| **Phase A.2 — Privacy / Terms versioning** | **Jun 2026** | `@packages/policies` SSOT + `policy_acceptance` + `/legal/accept` gate + `requireCurrentPolicies` + `user.policy.accepted` → 35 events. As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |
| **Phase C.1 — Security perimeter (S1–S5a)** | **Jun–Jul 2026** | Rate-limit (fail-closed, IETF headers, memory/Postgres stores) + strict CSP (Caddy nonce) + CSRF (Origin-allowlist) + S5a abuse quick-wins (per-account counter, disposable-email, HIBP telemetry) + 5 `security.*` events. S5b + S6 remain. As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |
| **Phase A.3 — Compliance docs bundle** | **Jul 2026** | `/legal/sub-processors` + `/legal/accessibility` + DPA/DORA templates + `docs/legal/README.md`. As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |
| **Phase A.4 — Cookie consent** | **Jul 2026** | `@packages/cookie-consent` + `consent_record` + `ConsentService` + `/consents` routes + `<CookieBanner>` + `<ConsentGate>` + `<AnalyticsScripts>` + `<LegalFooter>` + `/legal/cookies` + 2 events → 42 total. As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |
| **Phase B.1 — Billing (Stripe)** | **Jul 2026** | `@better-auth/stripe` + Stripe Checkout + Billing Portal + seat gate + 3-tier `ENTITLEMENTS` + `/pricing` + `/settings/billing` + 4 events → 46 total. As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |
| **Phase B.2 — Quota gating** | **Jul 2026** | `requireQuota`/`reserveQuota` + `quota_usage` + `useQuota`/`<QuotaGate>` + `billing.quota.exceeded` → 47 total. Dormant + knip-whitelisted. As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |
| **Phase C.2 — Operator audit log** | **Jul 2026** | `GET /admin/audit-log` (cursor pagination, filters) + tamper-evidence hash chain + `requirePlatformAdmin` + `/admin/audit-log` page (metadata diff, chain badge) + `security.operator.audit_accessed` → 48 total (52 after C.5). As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |
| **Phase C.5 — Webhooks front UI + event catalog** | **Jul 2026** | `/settings/webhooks` CRUD + delivery timeline + per-attempt drawer + `/developers/events` (48 subscribable events, JSON schemas, Node snippet) + SSRF guard + dual-secret rotation + auto-disable + 4 internal events → 52 total. As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |
| **Phase C.6 — Account recovery codes UI** | **Jul 2026** | `RecoveryCodesCard` + backup-code fallback on `/two-factor` + `BackupCodeUsedNotifier` + rate-limit + 2 events → 54 total. As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |
| **Phase A.5 — Privacy dashboard** | **Jul 2026** | `/settings/privacy` hub: `<PolicyAcceptanceCard />` + `<ConsentSettings />` + `<DataSourcesCard />` + `<DataExportCard />` + `<SessionsCard />`. Danger zones contextual. As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |
| **Phase D.5 — Email delivery queue** | **Aug 2026** | `email_message` durable queue + `EmailDeliveryWorker` + `@packages/emails` React Email templates + `sendTemplateBatch` + retention sweep + `email.delivery.exhausted` → 55 total. As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |
| **Option / Result convention back-fill** | **Aug 2026** | `Result.ok` overloads close the `Result.ok<string>() → undefined` hole; ports across consents, billing, rate-limiter, webhooks, outbox and audit express absence as `Option<T>` instead of `T \| null`, with `null` stopping at the store boundary. No wire format or hash-chain change. As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |
| **Phase C.3 — Admin & impersonation** | **Aug 2026** | `modules/admin/` (back) + `features/admin-users/` + `features/admin-orgs/` (front) — audited ban / unban / role-change / force-password-reset / revoke-sessions; justified impersonation (reason required, ticketRef optional); two-layer server-side blocklist (BetterAuth hook + 11 `denyImpersonated` Hono routes, incl. `POST /me/policies/accept`); non-dismissable banner with live countdown; transparency email to impersonated user. "Admin" nav entry (MFA-gated, links to `/admin/users`). Legal acceptance gate disabled during impersonation. All UI in English. `APP_URL` promoted to required. 7 `admin.*` events (`compliance`) → **62 total**. As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |
| **Phase C.4 — API tokens / PATs** | **Aug 2026** | `modules/api-token/` (back) + `features/api-tokens/` (front) — `clean_` + 44-char base58 + CRC32 checksum; HMAC-SHA256 + pepper rotation; org-scoped + expirable; `/settings/tokens` CRUD with `denyImpersonated` on writes (blocklist 11 → 13); `/api/v1` sub-app outside `AppType`; cascade revocation on membership loss; `POST /api/token-scanning/github` (ECDSA P-256); `visibility-map.ts` introduces explicit public/internal classification (28 public + 37 internal). 3 new events → **65 total / 28 public / 37 internal**. As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |

---

## 🚧 Priority — read top-to-bottom

Phase letters (A–F) are **themes**, not sequence — `A.4` is the consent item forever, regardless of when it ships. The list below is the **build order for a boilerplate**: deploy-safety + legal non-negotiables first (a clone can't ship to the EU without them), then revenue (the reason to clone a SaaS starter), then finish the half-built surfaces, then operator/enterprise/reach. Items in the same milestone parallelize; each links to its full spec further down by ID.

### ✅ Done — Phase 0 foundation closeout (Jun 2026)

0.1 schema split · 0.2 health probes (`/livez` `/readyz` `/startupz`) · 0.3 backups / disaster-recovery · 0.4 Sentry observability · 0.5 removability dry-run (−2980 LOC on `rgpd`) · 0.6 retention sweeps · 0.7 Railway reference deploy — **live on `main`, release 1.19.2**.

As-built record + all decisions in [`docs/HISTORY.md`](docs/HISTORY.md). Per-area docs: [HEALTH-PROBES](docs/HEALTH-PROBES.md) · [DISASTER-RECOVERY](docs/DISASTER-RECOVERY.md) · [OBSERVABILITY](docs/OBSERVABILITY.md) · [REMOVABILITY](docs/REMOVABILITY.md) · [DEPLOY-RAILWAY](docs/DEPLOY-RAILWAY.md) · [EVENTS](docs/EVENTS.md).

### ✅ Done — Phase A legal core

- **A.1** Right to rectification (Art. 16) + NIST 800-63B-4 password ✅ COMPLETE (Jun 2026) — `ProfileCard` + `ChangePasswordCard` + HIBP k-anonymity + min 15 + ban-list. As-built in [`docs/HISTORY.md`](docs/HISTORY.md).
- **A.2** Privacy policy / Terms versioning (Art. 7) ✅ COMPLETE (Jun 2026) — `@packages/policies` SSOT + `policy_acceptance` + `/legal/accept` gate + `requireCurrentPolicies` + `user.policy.accepted`. As-built in [`docs/HISTORY.md`](docs/HISTORY.md).
- **A.3** Compliance docs bundle ✅ COMPLETE (Jul 2026) — `/legal/sub-processors` (Art. 28) + `/legal/accessibility` (EAA Art. 14) + DPA template + DORA annex + `docs/legal/README.md`. As-built in [`docs/HISTORY.md`](docs/HISTORY.md).
- **A.4** Cookie consent + Consent management ✅ COMPLETE (Jul 2026) — dual-layer device-scoped, `@packages/cookie-consent` + `consent_record` + `ConsentService` + routes `/consents` + `<CookieBanner>` + `<ConsentGate>` + `<AnalyticsScripts>` + `<LegalFooter>` + `/legal/cookies` + 2 events → 42 total. As-built in [`docs/HISTORY.md`](docs/HISTORY.md).

### M1 — Deploy-safe & legal (a clone can't ship to the EU/US without these)

- **C.1** Security perimeter ✅ **rate-limit + strict CSP + CSRF + S4.1 store resilience + S5a abuse quick-wins shipped** (Jun–Jul 2026 — see ✅ table; S5b advanced signals + S6 captcha remain). **Promoted from Phase C**: a boilerplate shipping without auth rate-limit / CSP hands a live vuln to every clone — same non-negotiable tier as RGPD.
- **A.3** Compliance docs bundle ✅ **shipped** (Jul 2026 — see ✅ table; 2 public pages + DPA/DORA templates landed. RSS change history + re-acceptance trigger on sub-processor changes deferred as next-step; accessibility auto-update tied to A.6). As-built in [`docs/HISTORY.md`](docs/HISTORY.md).
- **A.4** Cookie consent + Consent management ✅ **shipped** (Jul 2026 — dual-layer device-scoped, `<ConsentGate category>` + `<AnalyticsScripts>` + `<LegalFooter>`, réconciliation login via `hooks.after`+`newSession`, 2 events → **42 total**. GPC/DNT requalifiés hors scope EU. As-built dans [`docs/HISTORY.md`](docs/HISTORY.md).)
- **A.7** US privacy — Global Privacy Control (GPC) `[deferred]` (2026-07-10) — honor `Sec-GPC: 1` as a binding CCPA/state-law opt-out. **Deferred until a clone ships real tracking** (same "no real substrate to exercise it" call as S5b/S6): the boilerplate tracks nothing by default (full opt-in RGPD, zero third-party analytics wired, zero data sale), so GPC has nothing to cut today and §7025(f) exempts a no-sale site from the "Do Not Sell" link. Activation hook documented in the full spec below — reuses A.4's `consent_record` / `ConsentService`, ~1-2h when a clone wires `VITE_ANALYTICS_SRC` or sells data.

### M2 — Revenue (the #1 reason to clone a SaaS starter)

- **B.1** Billing via `@better-auth/stripe` ✅ **shipped** (Jul 2026 — see ✅ table; Stripe Checkout + Billing Portal + seat gate + 3-tier entitlements + `/pricing` + `/settings/billing`. 4 billing events → **46 total**. As-built in [`docs/HISTORY.md`](docs/HISTORY.md).)
- **B.2** Feature & quota gating ✅ **shipped** (Jul 2026 — see ✅ table; quota catalog in `ENTITLEMENTS[tier].quotas`; `requireQuota`/`reserveQuota` middleware; `quota_usage` store; `useQuota`/`<QuotaGate>` front; `billing.quota.exceeded` operational event → **47 total**. Dormant + knip-whitelisted. As-built in [`docs/HISTORY.md`](docs/HISTORY.md).)

### M3 — Finish the half-shipped surfaces (backends done — highest value per LOC)

- **C.2** Audit log **front UI** ✅ **shipped** (Jul 2026 — see ✅ table; operator `/admin/audit-log` page (filters, cursor pagination, metadata diff, chain badge) + `requirePlatformAdmin` + tamper-evidence hash chain + `security.operator.audit_accessed` → **48 at ship, 52 after C.5**. As-built in [`docs/HISTORY.md`](docs/HISTORY.md).)
- **C.5** Webhooks **front UI** + `webhook.test` ✅ **shipped** (Jul 2026 — see ✅ table; `/settings/webhooks` operator page (CRUD, wildcard subscriptions, delivery timeline, per-attempt drawer, one-shot secret reveal, rotate, send-test, auto-disabled badge) + public `/developers/events` catalog (48 subscribable events, JSON schemas, Node verification snippet) + SSRF guard + dual-secret rotation + `webhook_delivery_attempt` table + auto-disable. 4 internal events → **52 total / 48 subscribable / 4 internal**. As-built in [`docs/HISTORY.md`](docs/HISTORY.md). **Next-step**: curate the public catalog — `/developers/events` publishes all 57 subscribable events by default; exposure should be an explicit allowlist, not the default. Spec below.)
- **C.6** Account recovery codes UI ✅ **shipped** (Jul 2026 — see ✅ table; `RecoveryCodesCard` regenerate-only + password gate + codes natively formatted `xxxxx-xxxxx` by BetterAuth + copy/download, backup-code fallback on `/two-factor` (input normalization tolerant: whitespace stripped, dash auto-inserted), `BackupCodeUsedNotifier` (first `onEvent` handler), rate-limit `generate-backup-codes`, 2 compliance events → **54 total / 50 subscribable / 4 internal**. As-built in [`docs/HISTORY.md`](docs/HISTORY.md).)
- **A.5** Privacy dashboard ✅ **shipped** (Jul 2026 — see ✅ table; `/settings/privacy` hub: `<PolicyAcceptanceCard />` + `<ConsentSettings />` + `<DataSourcesCard />` + `<DataExportCard />` + `<SessionsCard />`. Danger zones contextual (GitHub/Linear/Vercel model — no separate Danger tab). 0 events, catalog stays 54/50/4. As-built in [`docs/HISTORY.md`](docs/HISTORY.md).)

### M4 — Operate the product + paying customers

- **C.3** Admin & impersonation ✅ **shipped** (Aug 2026 — `modules/admin/` back + `features/admin-users/` + `features/admin-orgs/` front; audited ban/unban/role/reset/revoke-sessions, justified impersonation, two-layer blocklist (BetterAuth hook + 11 `denyImpersonated` routes incl. policy acceptance), MFA-gated "Admin" nav → `/admin/users`, legal gate disabled during impersonation, UI in English, `APP_URL` required, live banner, transparency email; 7 `admin.*` events → **62 total**. As-built in [`docs/HISTORY.md`](docs/HISTORY.md).)
- **C.4** API tokens / PATs ✅ **shipped** (Aug 2026 — `modules/api-token/` back + `features/api-tokens/` front; `clean_` + 44-char base58 + 6-char CRC32 checksum; HMAC-SHA256 + pepper rotation (`API_TOKEN_PEPPER` / `API_TOKEN_PEPPER_PREVIOUS` / `API_TOKEN_PEPPER_VERSION`); `/settings/tokens` CRUD (name + scope picker + expiry) with `denyImpersonated` on writes; `/api/v1` sub-app outside `AppType` (token-auth only, no session middleware); cascade revocation on membership loss; `POST /api/token-scanning/github` (ECDSA P-256); 3 events (`api_token.created`, `api_token.revoked`, `api_token.used`) → **65 total / 28 public / 37 internal**. As-built in [`docs/HISTORY.md`](docs/HISTORY.md).)
- **D.2** OpenAPI auto-docs `[deferred]` (2026-08-07) — **deferred until the API is actually opened to third parties**. The SOTA options (`@hono/zod-openapi` route rewrite, `hono-openapi` decorators) all demand restructuring every route registration to carry doc metadata, for a surface that has no external consumer yet. Docs that nobody reads still pay the drift tax on every route change. Revisit when a clone publishes `/api/v1` externally — the `zValidator(...)` schemas that make auto-derivation possible aren't going anywhere.
- **D.3** In-app notification center — `<Bell />` + `/settings/notifications`. Handler = 1-line `onEvent(...)` via event-driven foundation.
- **D.5** Email delivery ✅ **shipped** (Aug 2026 — see ✅ table; `email_message` durable queue + `EmailDeliveryWorker` polling + `@packages/emails` in-repo React Email templates + `sendTemplateBatch` + retention sweep. 1 new internal event → **55 total / 50 subscribable / 5 internal**. As-built in [`docs/HISTORY.md`](docs/HISTORY.md).)

### M5 — Lock in quality + compliance (gates over a now-complete surface — written once)

- **A.6** E2E gates — Playwright (full legal + billing + deletion chain) + Lighthouse a11y CI (WCAG 2.1 AA, EAA non-negotiable). **Moved late**: the suite covers the real flows once they exist, instead of being rewritten as B/C land.
- **D.4** SOC2 Type II checklist — maps shipped items to controls (do once most items exist).
- **D.1** Status page + SLO dashboards + alerting + OTel/Prometheus wiring — needs months of `/metrics` + customer surfaces to be meaningful (Cachet/Astro + Grafana + Sentry → Slack/PagerDuty).

### M6 — Enterprise + reach (long-tail multipliers)

- **C.7** SSO SAML/OIDC + SCIM (BetterAuth `sso` + SCIM endpoint) — biggest enterprise price multiplier, heavy. Audit integration trivial via `onEvent`.
- **E.1** i18n (TanStack Router locale routes + Lingui).
- **F.1** Capacitor mobile shell — depends on C.4 PATs + D.3 notifications. React Native rejected.
- **F.2** Feature flags (GrowthBook self-hosted).
- **E.2** Marketing site (Astro 5 + Payload 3, self-hosted, isolated) — deferred / low-priority, independent of the chain above.

### Cross-cutting (ship at first consumer)

- One-click unsubscribe RFC 8058 (Resend `List-Unsubscribe-Post`) — first marketing template lands
- Email auth (SPF + DKIM + DMARC `p=reject`) — DNS, doc only
- NIS2 readiness checklist — when clone passes ≥50 employees / €10M revenue

### Out of scope

HIPAA tooling, real-time WebSocket/SSE bus, third-party app marketplace, A/B testing framework, IAB TCF v2.2.

---

## Compliance docs bundle — **Phase A.3**

**Shipped (Jul 2026).** `/legal/sub-processors` (Art. 28, typed `SUB_PROCESSORS` const, relocated to `shared/` in A.5) + `/legal/accessibility` (EAA Art. 14, WCAG 2.1 AA / EN 301 549 v3.2.1, `accessibility@[domain]` complaint alias) + `docs/legal/DPA-template.md` + `docs/legal/DORA-annex-template.md` + `docs/legal/README.md` + command-palette links + `data-rights` cross-links. 0 domain events. As-built in [`docs/HISTORY.md`](docs/HISTORY.md).

**Deferred**: (1) RSS change history + re-acceptance trigger on sub-processor list changes (Art. 28 §2 advance-notice automation); (2) accessibility statement auto-update tied to A.6 Lighthouse CI (page `[ ]` item — auto-reflects new conformance state when Lighthouse CI audit changes).

---

## Cookie consent + Consent management — **Phase A.4**

**Shipped (Jul 2026).** Device-scoped dual-layer consent: `cc_sid` httpOnly cookie (device→server link) + `consent_record` append-only table (`subjectId NOT NULL`, `userId` nullable FK `ON DELETE CASCADE`). `@packages/cookie-consent` SSOT (`COOKIE_CONSENT_VERSION` date-string) + `ConsentService` + `DrizzleConsentStore` + routes `/consents` (`optionalAuth`, CSRF-exempt, rate-limited POST/DELETE) + `<CookieBanner>` (CNIL symmetry Reject/Accept, `necessary` non-toggleable) + `<ConsentSettings>` + `<ConsentGate category>` + `<AnalyticsScripts>` (`VITE_ANALYTICS_SRC`) + `<LegalFooter>` (AppShell) + `/legal/cookies`. Reconciliation guest→user at login via `hooks.after`+`ctx.context.newSession`. TTLs: `CONSENT_GRANT_TTL_DAYS=180` + `CONSENT_REFUSAL_TTL_DAYS=180`. GPC/DNT requalified out of EU scope (RGPD opt-in model covers compliance without header-checking). 2 events (`user.cookie_consent.{granted,withdrawn}`, retention `compliance`) → **42 total**. As-built + all deviations in [`docs/HISTORY.md`](docs/HISTORY.md).

**Deferred**: (1) DB hook on `policy_version` change to invalidate `consent_record` (date-based `COOKIE_CONSENT_VERSION` SSOT used instead); (2) dedicated re-prompt cooldown UX mechanic (TTL via `CONSENT_REFUSAL_TTL_DAYS` delivered; UX mechanic itself deferred); (3) `onEvent` client-side `umami.disable()` handler (covered by `<AnalyticsScripts>` unmount via `useConsent("analytics")`).

---

## US privacy — Global Privacy Control (GPC) — **Phase A.7**

> **Status — deferred (2026-07-10).** Bypass décidé après revue SOTA 2026. **Rationale**: the boilerplate ships **zero tracking** by default (full opt-in RGPD, no third-party analytics wired, no data sale), so on substance every clone is *already stricter* than CCPA demands — a GPC-signalled visitor has nothing tracked either way, and §7025(f) exempts a no-sale site from the mandatory "Do Not Sell/Share" link. GPC's value here is **100% preventive for a future clone**, not for the boilerplate itself — the same "no real substrate to exercise it" call already made for **S5b advanced abuse signals + S6 captcha**. Building it now = legal infra with nothing to guard (the OpenUp anti-pattern). The full spec below is kept as the **activation runbook**.
>
> **SOTA notes captured during the review** (so the next session doesn't re-research): header is `Sec-GPC: 1` only (no `0`; absence = no signal) + DOM `navigator.globalPrivacyControl`. **DNT is legally dead** (W3C dissolved the WG in 2019) — drop it, do **not** ship the "courtesy alias" the tasks below mention. GPC is a **mutable browser state re-sent on every request**, so the correct model is *override computed at read-time* (never a persisted "current state"); persistence, if any, is **evidence-only** (immutable audit row). 12 US states make GPC a binding UOOM in 2026; enforcement is real (Sephora $1.2M, multi-state sweep Sept 2025, Ford settlement Mar 2026 → per-tracker audit is the baseline). CA §7025(c)(6) (2026) requires a **visible "opt-out honored"** confirmation — already covered by the planned `<CookieBanner>` "GPC detected" state.
>
> **Activation hook (minimal core when a clone wires tracking)**: (1) `gpc.middleware.ts` reads `Sec-GPC: 1` → `c.var.gpcSignalled`; (2) `ConsentService.getActive` forces `analytics` + `marketing` off when signalled (recomputed per request, always fresh) — this alone makes every clone GPC-safe because `getActive()` already drives `<ConsentGate category="analytics">` → `<AnalyticsScripts>`; (3) add nullable `consent_record.source` (`text` enum `["banner","settings","gpc","api"]`, pattern `audit_actor_type`) + one idempotent evidence row on login of a signalled user; (4) `<CookieBanner>` "GPC detected, tracking off" state. **Drop from the original spec** (over-engineered for a boilerplate): `/.well-known/gpc.json`, 365-day refusal TTL, DNT alias.

**Why** (M1 — US counterpart of A.4): the EU opt-in model already tracks nothing without explicit consent, so on substance a clone is *stricter* than US law demands. But CCPA/CPRA (California) and the 2024–2025 wave of state privacy laws (Colorado CPA, Connecticut CTDPA, Texas TDPSA, Oregon, Montana…) treat the `Sec-GPC: 1` browser header as a **legally binding opt-out signal** — honoring it is mandatory, not advisory (unlike the EDPB stance that made us park it in A.4). A boilerplate that ignores GPC hands every clone a CCPA violation the moment it has a Californian visitor. This is the one concrete US-required mechanism A.4 doesn't cover.

**Why still infra, not DDD**: same class as A.4 — reading a request header and forcing a consent category to `false` is a middleware + a default, no aggregate. Reuses the entire A.4 `consent_record` + `ConsentService` machinery; GPC is just an *input* that pre-seeds a withdrawal.

**Decided shape**:
- **Server middleware** reads `Sec-GPC: 1` (and legacy `DNT: 1` as a courtesy alias — no legal weight, but cheap). On presence, `analytics` + `marketing` default to **declined** and any incoming grant for those categories is refused (opt-out overrides opt-in for GPC-signalled visitors).
- **Persist the signal** on the `consent_record` row (`source: "gpc"`) — CCPA demands *demonstrability* that the opt-out was honored, mirroring A.2's Art. 7 evidence logic.
- **Front reflects it**: `<CookieBanner>` shows a "Global Privacy Control detected — analytics/marketing off" state instead of the prompt; re-grant possible only by an explicit affirmative user action (GPC can be overridden by an opt-in choice, per CCPA).
- **Scope flag** — env `PRIVACY_GPC_ENABLED` (default on). GPC is US-oriented; EU behaviour is unchanged (opt-in already covers it), so no regression for EU-only clones.
- **"Do Not Sell/Share"** — stays near-moot: opt-in + zero data-sale means the mandatory CCPA link points at an already-empty opt-out. Document the override hook; bolt real UX on only if a clone actually sells data.

**Tasks**:

- [ ] Middleware `apps/api/src/shared/middleware/gpc.middleware.ts` — parse `Sec-GPC` / `DNT`, expose `c.var.gpcSignalled`, force-decline `analytics` + `marketing` for signalled requests. Composed before the `/consents` routes.
- [ ] `ConsentService.record` refuses `analytics` / `marketing` grants when `gpcSignalled` (opt-out wins) + stamps the origin on `consent_record`.
- [ ] Schema delta: `consent_record.source` enum (`user` | `gpc` | `reconcile`) — demonstrability evidence, append-only like the rest of the table.
- [ ] Front: `<CookieBanner>` reads a server-passed `gpcSignalled` flag via `consentQueryOptions` → renders the "GPC detected, tracking off" state instead of the prompt; re-grant only via explicit toggle.
- [ ] Reuse `user.cookie_consent.withdrawn` event with `source: "gpc"` in the payload — no new event type unless the audit trail needs to distinguish auto-GPC from user-withdrawal.
- [ ] Doc: `/legal/cookies` + `/legal/data-rights` mention GPC support; README notes `PRIVACY_GPC_ENABLED`.

**Out of scope**:
- Full CCPA "Do Not Sell/Share" opt-out portal — moot under the opt-in + no-sale model; document the hook, build UX only when a clone sells data.
- Per-state divergence (each state's exact cure period / notice wording) — GPC honoring is the shared mechanism; state-specific legal copy is a lawyer task, not code.

---

## Privacy dashboard — **Phase A.5**

**Shipped (Jul 2026).** `/settings/privacy` hub composing `<PolicyAcceptanceCard />` (A.2 acceptance status) + `<ConsentSettings />` (A.4) + `<DataSourcesCard />` (static `SUB_PROCESSORS`) + `<DataExportCard />` + `<SessionsCard />`. GitHub/Linear/Vercel-style contextual danger zones: `<RgpdDeletionCard />` at bottom of `account.page.tsx`, org leave/delete at bottom of `organization.page.tsx`. Danger tab dissolved. `sub-processors.config.ts` promoted to `shared/` (consumed by both `features/legal/` and `features/privacy/`). 0 events, catalog stays 54/50/4. As-built in [`docs/HISTORY.md`](docs/HISTORY.md).

**Deferred**: acceptance history UI (data already in `policy_acceptance` table; no new back-end route added).

---

## End-to-end gates — Playwright + Lighthouse a11y CI — **Phase A.6**

**Why** (M5 — gates over a now-complete surface): closes regression-proof gates over (1) the full legal chain — deletion silently leaving orphans = compliance theatre, (2) WCAG 2.1 AA — EAA non-negotiable since 28 June 2025, accessibility regressions ship invisibly without automation. Bundled because both gates run in CI on the same Playwright runner.

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

**Shipped (Jun–Jul 2026, S1–S5a).** Unified `rate-limiter-flexible` middleware fail-closed on auth (OWASP A10:2025, IETF `RateLimit` headers, trusted-proxy CIDR, memory/Postgres dedicated-pool stores; BetterAuth built-in `rateLimit` disabled for single source of truth). Strict CSP via **Caddy nonce** (`{http.request.uuid}` placeholder + `html.cspNonce` in Vite — not a Hono middleware; SPA is Caddy-served; `/csp-report` public, IP-rate-limited, CORP-hardened). CSRF via **Origin-allowlist** (not double-submit — stateless, Bearer clients exempt; decoupled cross-origin deploy makes `__Host-csrf` double-submit unworkable). S4.1: dedicated pg limiter pool (`max:3`, 500ms acquire timeout, fail-closed-fast — no in-memory insurance). S5a: per-account credential-stuffing counter on `/sign-in`, disposable-email block (~90k-domain list + MX check, fail-open → `security.signup.rejected`), HIBP breached-password telemetry (→ `security.password.breached`). 5 `security.*` events. **Trusted Types** deferred (partial browser support; report-only would flood audit_log on a non-TT-migrated app). As-built + key deviations in [`docs/HISTORY.md`](docs/HISTORY.md).

**Deployment reminders**: `RATE_LIMIT_STORE=memory` is per-replica — switch to `postgres` before horizontal scaling; `TRUSTED_PROXIES` must be set behind a load-balancer (collective lockout risk if unset).

**Remaining — S5b + S6** (deferred until real traffic exists to calibrate false-positive rate; VPN/carrier-NAT for geo, device-fingerprint bypass risk):

- [ ] **Impossible-travel** — flag a sign-in whose geo-IP jumps faster than physically possible vs the last session (`session.ipAddress` + `userAgent` already stored). **(S5b)**
- [ ] **Free-trial abuse** — IP/device-fingerprint heuristic capping accounts-per-visitor. **(S5b — disposable-email block is the cheap first layer, already in S5a.)**
- [ ] **Geo / suspicious-IP deny-list** — env-driven country/ASN block middleware → `security.*` events (rule §6). **(S5b)**
- [ ] **Captcha hook** (Turnstile / hCaptcha free tier — `ICaptchaService` port) — invoked when `requireRateLimit` enters near-cap state (>80% of window), optional, env-flagged. **(S6)**

---

## Admin & impersonation — BetterAuth `admin` plugin — **Phase C.3** ✅ SHIPPED (Aug 2026)

**Shipped (Aug 2026).** `modules/admin/` (back) + `features/admin-users/` + `features/admin-orgs/` (front). Audited ban / unban / role-change / force-password-reset / revoke-sessions via `AdminActionService` (not registered in inwire — real import cycle; deps from `di`). Justified impersonation (`reason` required, `ticketRef` optional); `/stop` validates BetterAuth before emitting the event. Server-side blocklist: BetterAuth `beforeHook` + per-mutation `denyImpersonated` on 11 mutation routes. Non-dismissable banner with live countdown in `_shell`. Transparency email (`NotifyImpersonatedUserHandler`, tolerant). `cookieCache.maxAge` reduced to 60 s. 7 `admin.*` events, all `compliance` retention → **62 total / 57 subscribable / 5 internal**. As-built + all decisions in [`docs/HISTORY.md`](docs/HISTORY.md).

**Out of scope** (explicit): dedicated admin subdomain (`admin.<APP_DOMAIN>`); platform `support` role (read-only — BetterAuth plugin supports one platform role); org mutations from the back-office; IP allowlist for admin access; session-length alerting.

---

## API tokens / Personal Access Tokens — **Phase C.4** ✅ SHIPPED (Aug 2026)

**Why**: any B2B SaaS exposes its API to customer systems. PATs are the standard primitive (OAuth-app flow comes later if needed). Without them, customers integrate via screen-scraping or session-cookie-stealing — both bad.

**Relation to BetterAuth** (default-to-the-lib): BetterAuth ships an OSS `apiKey` plugin (`@better-auth/api-key@1.6.26`, self-hostable). **Evaluated 2026-08-06 → hand-roll** (`modules/api-token/`). It covers table + SHA-256 + expiry + CRUD, but: (a) **no lifecycle hooks** — rule #6 (event in the same TX) forces wrapping every endpoint anyway; (b) `referenceId` is user **XOR** org, never both — no "org token, created by member X" without custom columns; (c) its DB rate-limit does one `UPDATE` per request and duplicates `rate-limiter-flexible` (C.1/S4.1); (d) permissions are stored but never enforced. Once wrapped, what remains is a table with 8 dead columns against a `ScopedRepository` that natively honours instrumentation (rule #8) and the outbox. Steal its permission format and column list, not its runtime.

**Design decisions (2026-08-06)** — org-scoped · HMAC-SHA256 + server pepper · CRC32 checksum.

- [x] DB schema `api_token(id, userId FK, organizationId FK nullable, name, tokenHmac unique indexed, pepperVersion, tokenStart, scopes jsonb, lastUsedAt, expiresAt, createdAt, revokedAt nullable, revokedReason nullable)`. `userId` is both creator and owner — no separate `createdByUserId`, cascade revocation makes them the same person. Token shown ONCE at creation. **`ScopedRepository<ApiToken, RepoScope>`** (first consumer in the codebase — the interface ships in `ddd-kit` but nothing implements it yet) — wrong-owner returns `Option.none()` / `NOT_FOUND`, never 403.
- [x] Storage: `HMAC-SHA256(pepper, token)` in a unique-indexed column, **not** sha256 + per-row salt — a per-row salt destroys the O(1) lookup (forces a table scan) and buys nothing against a 256-bit secret (rainbow tables are inconceivable). The pepper (`API_TOKEN_PEPPER`, env/Vault, required in prod) is the real gain: a DB dump alone yields no usable token — the D.4 SOC2 argument. `pepperVersion` column allows rotation. Transparent rehash via `API_TOKEN_PEPPER_PREVIOUS` on next use — zero-downtime pepper rotation.
- [x] Generation: `clean_` + 44-char base58 body (uniform-random, rejection-sampling, no modulo bias) + 6-char CRC32 checksum, GitHub-style. Checksum rejects typos/truncations **before** the DB hit and sharpens the secret-scanning regex. Prefix configurable (`API_TOKEN_PREFIX`) — every clone needs its own.
- [x] Scopes — typed const `API_SCOPES = ["read:profile", "write:profile", "read:organizations"] as const`. Per-token subset, no global `*`, no `admin` scope (platform-admin surface is never token-reachable). **`read:uploads` dropped**: `modules/uploads/` exposes no listing route, persists no metadata table (the server is deliberately blind during upload), and storage is an opt-in docker profile — the scope would guard a route that can't exist without out-of-scope work. **Anti-escalation is structural, not a check**: token management lives outside `/api/v1`, so a token can never mint a token. Only remaining rule — an org scope requires the matching org permission at issuance.
- [x] `requireApiToken` middleware (alternative to `requireAuth`) — accepts `Authorization: Bearer clean_<…>`, verifies checksum, HMACs, compares, sets `c.var.user` + `c.var.tokenScopes`. Ban check included — a banned account cannot use its tokens.
- [x] **Public API surface is opt-in, route by route.** A PAT is *never* accepted by `requireAuth` — only a route that explicitly mounts `requireApiToken({ scopes })` is reachable by token. Every other route stays session-only, by construction rather than by config. **Why**: "authenticated" ≠ "public API" — a token that inherits the whole session surface turns every internal route (admin, billing mutations, impersonation) into a public endpoint the day it ships, and the blast radius of a leaked token becomes the entire app. The opt-in registry doubles as the D.2 OpenAPI source: only token-reachable routes get documented.
- [x] `lastUsedAt` via time-bucket update (`WHERE last_used_at < now() - interval '15 min'`) — never one write per request (hot-row contention). Same bucket gives the `api_token.used` sampling for free.
- [x] `/settings/tokens` UI — create (name + scope picker + optional expiry), list (last-used timestamps), revoke. Created token shown ONCE in modal (reuse `<SecretRevealDialog>` from C.5), never persisted client-side.
- [x] Events: `api_token.created`, `api_token.revoked`, `api_token.used` (sampled, see above), all carrying `actorUserId` (rule #7).
- [x] Rate-limit **two axes**: per token (detects abuse of a legitimate/compromised key) and per IP (detects distributed attacks rotating tokens). One without the other is a blind spot.
- [x] GitHub Secret Scanning: the Partner Program requires a *public* service, so the boilerplate can't register — each clone does. Ship what makes it a 30-minute job: the configurable prefix, a ready `POST /api/token-scanning/github` revocation route verifying the **ECDSA P-256** signature (`GITHUB-PUBLIC-KEY-SIGNATURE` + `GITHUB-PUBLIC-KEY-IDENTIFIER` against `api.github.com/meta/public_keys/secret_scanning` — *not* the `X-Hub-Signature-256` HMAC used by regular webhooks), and the enrolment doc (see [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md#6-github-secret-scanning-program)).

**Next-step — curated public catalog** ✅ shipped in C.4. `/developers/events` now publishes only events listed as `"public"` in `packages/events/src/visibility-map.ts`. Three consumers enforce it: `WebhookFanoutSubscriber`, the catalog page, and the subscription picker. See [`docs/EVENT_PIPELINE.md`](docs/EVENT_PIPELINE.md#event-visibility--public-vs-internal).

---

## Outbound webhooks front UI — **Phase C.5** ✅ SHIPPED (Jul 2026)

**Shipped (Jul 2026).** SSRF guard (create + delivery-time anti-DNS-rebinding), dual-secret rotation (`WEBHOOK_SECRET_GRACE_HOURS` grace window), `webhook_delivery_attempt` table (request/response headers+body capped at `WEBHOOK_RESPONSE_CAPTURE_BYTES`), auto-disable after `WEBHOOK_AUTO_DISABLE_AFTER_DAYS`, wildcard subscriptions, full CRUD API. `/settings/webhooks` operator page (per-attempt timeline drawer, one-shot secret reveal, rotate-secret dialog, send-test, auto-disabled badge) + public `/developers/events` (48 subscribable events, JSON schemas, Node signature-verification snippet). 4 new internal events (`webhook.test`, `webhook.endpoint.secret_rotated`, `webhook.endpoint.disabled`, `webhook.delivery.exhausted`) → **52 total / 48 subscribable / 4 internal**. As-built in [`docs/HISTORY.md`](docs/HISTORY.md).

**Curated public catalog** ✅ shipped as part of C.4. `packages/events/src/visibility-map.ts` is the SSOT (28 public / 37 internal after C.4). `/developers/events`, the subscription picker, and `WebhookFanoutSubscriber` all enforce it. See [`docs/EVENT_PIPELINE.md`](docs/EVENT_PIPELINE.md#event-visibility--public-vs-internal).

**Deferred**: Webhook proxy (Svix-style) — evaluate past 10k deliveries/day.

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

## Audit log front UI — **Phase C.2**

**Shipped (Jul 2026)** as operator surface (cross-org, `requirePlatformAdmin`) — not per-tenant. `requireOrgPermission({ auditLog: ["read"] })` statement kept in `@packages/access-control` for a future per-tenant view. Tamper-evidence hash chain env-gated (`AUDIT_TAMPER_EVIDENCE`), genesis-at-activation, zero backfill + `GET /admin/audit-log/verify`. `security.operator.audit_accessed` meta-event (compliance, first page only). `/admin/audit-log` page (filters, cursor pagination, `MetadataSheet` before/after diff, `ChainBadge`). As-built in [`docs/HISTORY.md`](docs/HISTORY.md).

**Deferred**: per-tenant audit log view (org-admin scoped, `requireOrgPermission` variant on the read route — statement already in access-control, back-end route not yet built).

---

## In-app notification center — **Phase D.3**

**Why**: transactional emails are async; users miss them. An in-app inbox is the SaaS-default pattern (Linear, GitHub, Stripe). Persistent, mark-as-read, deep-linked.

**Design settled 2026-08-07** (full spec local, not versioned — `docs/superpowers/` is gitignored). SOTA baseline: Knock / Novu / Courier / SuprSend converge on six primitives (workflow engine, three-level preferences, batching + digest, critical bypass, throttling with dedup, inbox over feed). Two deliberate divergences: SSE instead of WebSocket, and a typed `Record<EventType, Config>` instead of a workflow DSL — the outbox already resolves fan-out, which is the only reason those platforms need a DSL at all.

- [ ] **Fan-out = `NotificationFanoutSubscriber implements OutboxSubscriber`**, in the dispatch TX beside `AuditEventSubscriber` / `WebhookFanoutSubscriber` — **not** the `onEvent(...)` post-commit handler this spec originally suggested. **Why**: `onEvent` is best-effort and isolated, so a lost notification fails silently; and batching needs a transactional write (two concurrent events on one batch key without a lock produce two batches). Constraint: one `INSERT ... SELECT` joining members × preferences, never N inserts in a loop.
- [ ] **Recipients resolved by capability, never by role tuple.** `type Audience = "self" | "actor" | "org:all" | { can: OrgPermissions }`. **Why**: `audience: "org:admins"` is exactly the hardcoded tuple org-scoping rule #6 forbids — it duplicates a decision owned by `@packages/access-control` and drifts the moment a role is added. Costs nothing at runtime: roles are static code, so `ORG_ROLES.filter(r => authorizeRole(r, perms))` resolves once at boot, leaving `WHERE member.role = ANY($1)`. **Trap**: `billing:["manage"]` is owner-only (`access-control/src/index.ts:33`) — a notification asks *who needs to know*, not *who may act*, so `read` is almost always the right level.
- [ ] **`notification-map.ts`** — third projection of the catalog after `visibility-map` (webhooks) and `retention-map` (purge). Absent event = no notification (the default: most of the 65 events are audit-only). `forced: true` short-circuits preferences *and* batching, before either is evaluated (the SOTA critical bypass).
- [ ] **Batching splits per channel.** In-app writes the row immediately and groups on read by `groupKey` (Linear's "X and 3 others"); email batches on write via `emailPendingAt` / `emailSentAt` columns. **Why no `notification_batch` table**: SaaS platforms need one because they don't own their customers' storage. We do — so the batch stays a query instead of state that can desync. Frequency preference (`immediate` / `hourly` / `daily`) supplies the window, which makes the scheduled digest the same cron with a longer one.
- [ ] **Throttling = partial unique index** `(userId, dedupKey) WHERE dedup_key IS NOT NULL`, with the window baked into the key (`<eventType>:<resourceId>:<hourBucket>`). Dedup happens at insert inside the TX, so it's concurrency-correct; a counter would need an extra lock for the same guarantee.
- [ ] Tables: `notification(id, userId, organizationId?, category, eventType, groupKey, dedupKey?, payload, readAt, emailPendingAt, emailSentAt, createdAt)` + `notification_preference(scope 'user'|'org', scopeId, category, channel, enabled, frequency, locked, updatedAt)`. Partial index `ON notification (user_id) WHERE read_at IS NULL` for the unread count. **`organizationId` nullable is a documented exception to org-scoping rule #3** — a notification is user-scoped by nature (`user.password_changed` belongs to no org).
- [ ] **Preference cascade**: org lock → user preference → map default, with `forced` bypassing all three. Org-level is the SOTA B2B differentiator (Knock) and near-free here.
- [ ] **SSE stream carries a signal, never data.** `GET /notifications/stream` (Hono `streamSSE`) + Postgres trigger `pg_notify('notification_created', user_id)`, mirroring `outbox-dispatcher.service.ts:104`. **Why signal-only**: a reconnect just fires `invalidateQueries`, which by definition catches up — killing `Last-Event-ID`, replay, and merge logic in one stroke, and degrading naturally to polling if the stream dies. **`NotificationStreamHub` holds one `LISTEN` connection per instance**, never one per client (that exhausts the pool at a few hundred connected users); multi-instance works broker-free since `pg_notify` broadcasts to every listener. Heartbeat 25 s (Caddy timeouts). Client uses `fetch` + `ReadableStream`, **not `EventSource`** — it can't carry an `Authorization` header, which would break F.1's Capacitor bearer.
- [ ] Front: `<NotificationBell />` in `app-shell`, `/settings/notifications` in `settingsLayout`; org defaults as a card inside `/settings/organization` (a route under `orgScopeLayout` would collide — it flattens children under `settings/`). Polling survives only as fallback: `refetchInterval: streamConnected ? false : 30_000`. **Promotes `auth-broadcast.ts` into `createBroadcastChannel<T>(name)`** — 2nd occurrence triggers rule #2.
- [ ] Crons on the existing `/internal/*` rail: `flush-notification-emails` (1 min — so `immediate` means "next tick"; true instant is the SSE's job) + `sweep-notifications` (**read rows only** — an unread notification outlives retention, same logic as D.5's `failed` rows).
- [ ] **No new events.** D.3 consumes the catalog, doesn't extend it — a notification is a read projection of an already-audited event, and `notification.created` would loop with its own subscriber. Catalog stays **65 / 28 public / 37 internal**.
- [ ] Out of scope: native push (mobile / browser, Phase F), generalized real-time bus, workflow DSL.
- [ ] **Resend Broadcasts/Audiences rejected**: marketing one-to-many, orthogonal to event-driven one-to-one. Topics (Resend-side email preferences) also rejected — it would hand a product decision to the vendor and covers only one channel, when D.3 exists precisely to arbitrate *between* channels. Revisit Broadcasts at E.2 (newsletter / marketing digests).

---

## Email delivery — **Phase D.5** ✅ SHIPPED (Aug 2026)

**Shipped (Aug 2026).** `email_message` durable queue + `EmailDeliveryWorker` (poll 2s, claim 300, chunk 100, `resend.batch.send`) + `@packages/emails` in-repo React Email templates (`TEMPLATE_IDS` as override) + port methods `sendRaw`/`sendTemplateBatch`/`sendRawBatch` + retention sweep (`EMAIL_MESSAGE_RETENTION_DAYS=7`). Provider facts: rate limit 10 req/s per team; `scheduled_at` supported in batch; `Idempotency-Key` is batch-level (`<message-id>/<chunk-index>`); bounce suppression provider-side (no `email_suppression` table needed). `email.delivery.exhausted` internal event → **55 total / 50 subscribable / 5 internal**. Note: `SendTemplateOptions.tx?` exists on the port but has no caller — every send is enqueued post-commit and best-effort (`idempotencyKey` by contrast is used widely: `auth.ts` + 3 RGPD sites). As-built in [`docs/HISTORY.md`](docs/HISTORY.md).

**Known debts (follow-up work)**:

- **`failed` rows never purged.** Retention sweep filters `status='sent'` only; no covering index on `failed` rows. Deliberate — a failed row is the operator's only trace of a dropped email — but unbounded. Decide: a longer retention cutoff for `failed` (with a covering index) or an explicit decision that failed rows are forensic and kept indefinitely.
- **`markSent` is one UPDATE per row.** A 100-message chunk costs 100 round-trips (each row carries its own `provider_message_id`). A single `UPDATE … WHERE id IN (…)` with a `CASE WHEN` for the provider id would collapse it to one. No correctness issue; pure throughput.
- **`delete_completed` notification lost its idempotency key.** Pre-D.5 it was sent per-account with `` idempotencyKey: `delete-completed/${userId}` ``. The batched RGPD sweep call passes no options, so a worker crash between provider acceptance and `markSent` commit can send a duplicate deletion confirmation. Judged acceptable at review for a notification email. Fix: pass a per-recipient idempotency key through `sendTemplateBatch` (already suffixes keys per recipient).

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

**Why** (M5 — wires alongside its Grafana consumer): Phase 0.4 shipped Sentry error tracking only ; OTel tracing + Prometheus `/metrics` were deferred here so they wire alongside their consumer (Grafana). What's needed at D.1 :

1. **Add OTel tracing** — `@hono/otel` + `@kubiks/otel-drizzle` (~150 LOC). Sentry consumes OTel spans natively, so `SENTRY_TRACES_SAMPLE_RATE` can finally bump > 0. `traceparent` header propagation api ↔ app (fetch interceptor in `api-client.ts`). Re-evaluate Bun native OTel availability before wiring.
2. **Add Prometheus `/metrics`** — `prom-client` adapter + `GET /metrics` route gated by `X-Metrics-Token`, mounted outside `requireAuth` + `httpLogger`. Health check registry from Phase 0.2 already exports `up{check}` state.
3. **Customer-facing trust layer** (public status page) and **operator-facing aggregation layer** (SLO dashboards + alerting policies). These depend on:

- Months of `/metrics` data accumulated *after* this phase wires it (so SLO baselines are realistic)
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

**Why**: D.1 wires Prometheus `/metrics` (deferred from 0.4, which shipped Sentry only — see step 2 above). Without dashboards on top, the accumulated metrics stay blind. SLOs (Service Level Objectives) translate raw metrics into "is the product healthy from a user perspective", which is what alerting fires on.

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

## OpenAPI schema docs — **Phase D.2** ⏸️ DEFERRED (2026-08-07)

**Deferred**: the API isn't open to third parties yet, and every SOTA approach (`@hono/zod-openapi`'s `createRoute` rewrite, `hono-openapi`'s per-route decorators) requires restructuring route registration across the codebase to carry doc metadata. That cost buys nothing until an external consumer exists, and unread docs still drift on every route change. **Activation trigger**: a clone publishes `/api/v1` to third parties. The `zValidator(...)` schemas the derivation depends on stay in place, so nothing rots meanwhile.

**Why (original)**: the moment Phase C.12 (PATs) ships, customers will integrate. They need typed docs. Manual maintenance = drift = support tickets.

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

**Shipped (Jul 2026).** `@better-auth/stripe@1.6.23` + Stripe Checkout (upgrade) + Billing Portal (manage) — no billing backoffice. Subscription SSOT = plugin `subscription` table (webhook-synced). Hybrid catalog: prices + display in Stripe (each paid Product needs `metadata.tier` = `pro`|`business`; `marketing_features` drive pricing bullets); entitlements (`features`, `rank`, `maxMembers`) in typed `ENTITLEMENTS[tier]` at `apps/api/src/modules/billing/config.ts` — gate change = code + deploy (never Stripe dashboard). 3 tiers: `free` (3 members), `pro` (20 + `audit_log`+`api`), `business` (unlimited = `null`, +`sso`). Standard unlimited team-orgs model; seat gate only (`beforeAddMember`/`beforeAcceptInvitation`/`beforeCreateInvitation` → 402). Back gates: `requireFeature`/`requirePlan` + seat gate. Front: `useEntitlements()` hook + `/settings/billing` + public `/pricing`. Env: `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` only (no `STRIPE_PRICE_*`). Dev: `stripe listen --forward-to localhost:3000/api/auth/stripe/webhook`. 4 events (`billing.subscription.{created,updated,cancelled}` compliance + `billing.payment.failed` operational) → **46 total**. As-built in [`docs/HISTORY.md`](docs/HISTORY.md).

---

## Feature gating & quota gating — guards layer — **Phase B.2**

**Shipped (Jul 2026), dormant.** Quota catalog joined B.1 entitlements SSOT (`ENTITLEMENTS[tier].quotas` — not a separate `PLANS` map). `requireQuota(key, readUsage)` pre-check (429 `BILLING_QUOTA_EXCEEDED`) + `reserveQuota` (advisory-lock atomic reserve inside write TX — TOCTOU-safe authoritative gate) + `countScopedRows` live-count default + `quota_usage` table + `modules/quotas/` `IQuotaUsageStore` + `useQuota`/`<QuotaGate>` front + `billing.quota.exceeded` operational event → **47 total**. Knip-whitelisted. Activation guide: [`docs/QUOTA-GATING.md`](docs/QUOTA-GATING.md). As-built in [`docs/HISTORY.md`](docs/HISTORY.md).

**Deferred**: (1) Per-org overrides for sales-led deals (custom quotas above plan baseline — `subscription.metadata` vs `org_overrides` table; skip until first enterprise contract). (2) Quota counter reset on plan change mid-period (Stripe handles billing proration; app-side counter reset = separate decision).

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
- [ ] **Auth error messages** — BetterAuth returns stable `code`s; **web-only default = map them front-side to Lingui catalog entries** (one i18n SSOT — auth errors + UI strings in the same place). **Decision point**: the day multi-client lands (F.1 Capacitor / C.4 PAT API consumers), switch to the OSS `@better-auth/i18n` plugin — server-side `code → localized message` (locale via `Accept-Language`/cookie/session, keeps `originalMessage`) so *every* client gets ready-localized errors without re-implementing the map. Web-only → front mapping wins (the plugin would be a second translation store divorced from Lingui).
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
- [ ] **Legal pages**: `/legal/privacy`, `/legal/terms`, `/legal/data-rights` (RGPD core + policy versioning shipped — see [`docs/HISTORY.md`](docs/HISTORY.md); `POLICY_URLS` in `@packages/policies` is the one-line swap point to host them here instead of in-app). Stored as `Pages` in Payload — non-tech can update without dev.
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
