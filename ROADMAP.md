# ROADMAP

Forward-looking work for clean-stack. **All SOTA 2026, outside DDD** (DDD reserved for pure business domain). Already-shipped work is logged in [`docs/HISTORY.md`](docs/HISTORY.md) ; current inventory in [`docs/FEATURES.md`](docs/FEATURES.md) (or [`docs/OVERVIEW.md`](docs/OVERVIEW.md) for the guided tour).

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
| **Event-driven foundation** | **May 2026** | outbox + LISTEN/NOTIFY dispatcher + 35 events emitted automatically (23 BetterAuth bridge + 5 RGPD + 3 uploads + 3 webhooks + 1 policy) + audit-log API + webhooks API + worker (HMAC + AEAD + decorrelated jitter retry) + retention sweeps (3 `/internal/sweep-*` routes, SOTA 2026 defaults). See [`docs/EVENTS.md`](docs/EVENTS.md) (DX guide + retention matrix) + [`docs/EVENT_PIPELINE.md`](docs/EVENT_PIPELINE.md) (visual walkthrough). |
| **Phase 0 — Foundation closeout** | **Jun 2026** | health probes + backups/DR + Sentry + removability dry-run + retention sweeps + **Railway reference deploy live on `main`**. As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |
| **Phase A.1 — Profil + NIST password** | **Jun 2026** | Rectification Art. 16 (`ProfileCard` nom/email/avatar, `ChangePasswordCard`) + NIST SP 800-63B-4 (min 15 chars, HIBP k-anonymity fail-open, ban-list contextual/common words, no complexity rules) + 2 compliance events (`user.profile.updated`, `user.email.change_requested`). As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |
| **Phase A.2 — Privacy / Terms versioning** | **Jun 2026** | Art. 7 demonstrability (RGPD): `@packages/policies` version SSOT + append-only `policy_acceptance` table + re-acceptance gate (`/legal/accept`, `_shell` redirect) + `requireCurrentPolicies` composable middleware + `user.policy.accepted` event (compliance retention, 35 events total) + sign-up checkbox + public `/legal/privacy-policy` + `/legal/terms` pages. As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |
| **Phase C.1 — Security perimeter (S1–S5a)** | **Jun–Jul 2026** | Unified rate-limit (fail-closed on auth — OWASP A10:2025, IETF `RateLimit` headers, trusted-proxy `private`/CIDR, memory / Postgres dedicated-pool stores) + strict CSP (Caddy per-request nonce + public `/csp-report`) + CSRF (Origin-allowlist, stateless) + abuse quick-wins (per-account credential-stuffing, disposable-email, HIBP telemetry) + 5 `security.*` events. Multi-agent SOTA-2026 reviewed; prod env fail-hard. Remaining: S5b advanced abuse signals → S6 captcha (S4.1 store resilience + S5a shipped). As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |
| **Phase A.3 — Compliance docs bundle** | **Jul 2026** | `/legal/sub-processors` (Art. 28 sub-processor disclosure — 3 active: Resend, R2, OAuth; 3 planned: Stripe, GrowthBook, Umami) + `/legal/accessibility` (EAA Art. 14, WCAG 2.1 AA / EN 301 549 v3.2.1 declaration + complaint alias) + `docs/legal/` DPA template (12 Art. 28 clauses) + DORA annex template (11 Art. 30 provisions) + README index + fintech-vs-B2B decision table. Linked via command-palette + `data-rights` cross-links (no global footer yet). Clone-ability fix: `VITE_SENTRY_DSN` empty-string coercion in `apps/app/src/shared/env.ts`. 0 domain events (static pages). As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |
| **Phase A.4 — Cookie consent + Consent management** | **Jul 2026** | Dual-layer device-scoped (preuve RGPD Art.7§1 = stockage serveur horodaté) : `@packages/cookie-consent` SSOT + append-only `consent_record` (`subjectId NOT NULL`, `userId` nullable, 2 indexes) + `ConsentService` (record append-only, fallback subjectId, reconcile) + routes publiques `/consents` (`optionalAuth`, `cc_sid` httpOnly, CSRF, rate-limit POST/DELETE uniquement) + sweep guests expirés + `<CookieBanner>` (symétrie CNIL Reject/Accept) + `<ConsentSettings>` + `<ConsentGate category>` + `<AnalyticsScripts>` (`VITE_ANALYTICS_SRC`) + `<LegalFooter>` (AppShell) + `/legal/cookies` + toast 429 global consolidé. Réconciliation au login via `hooks.after`+`ctx.context.newSession` (PAS `databaseHooks`). GPC/DNT requalifiés hors scope EU. 2 events (`user.cookie_consent.{granted,withdrawn}`, retention `compliance`) → **42 events**. As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |
| **Phase B.1 — Billing (Stripe)** | **Jul 2026** | `@better-auth/stripe` + Stripe Checkout + Billing Portal. Subscription SSOT = plugin `subscription` table (webhook-synced). Hybrid catalog: price + display in Stripe (`metadata.tier` join key, `marketing_features` bullets); entitlements (features, rank, `maxMembers`) in typed `ENTITLEMENTS[tier]` at `apps/api/src/modules/billing/config.ts` — gate change = code + deploy, never Stripe dashboard. 3 tiers: `free` (3 members), `pro` (20 members, `audit_log`+`api`), `business` (unlimited = `null`, +`sso`). Standard model: unlimited team orgs per user; seat gate only (`beforeAddMember` + `beforeAcceptInvitation` + `beforeCreateInvitation`), no create-org cap. Back gate primitives: `requireFeature`/`requirePlan`/seat gate → `402 BILLING_PAYMENT_REQUIRED`. Front: `useEntitlements()` hook. No billing backoffice: Stripe Checkout (upgrade) + Stripe Billing Portal (manage). UI: `/settings/billing` (plan + usage + Upgrade + Manage billing) + public `/pricing`. 4 new events (`billing.subscription.{created,updated,cancelled}` compliance + `billing.payment.failed` operational) → **46 events**. |
| **Phase B.2 — Quota gating** | **Jul 2026** | quota gating skeleton: catalog + `requireQuota`/`reserveQuota` + `quota_usage` + `useQuota`/`<QuotaGate>` + `billing.quota.exceeded` → **47 events**. Dormant + knip-whitelisted. As-built in [`docs/HISTORY.md`](docs/HISTORY.md). |

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
- **A.7** US privacy — Global Privacy Control (GPC) `[deferred]` (2026-07-10) — honor `Sec-GPC: 1` as a binding CCPA/state-law opt-out. **Deferred until a clone ships real tracking** (same "no substrate to exercise it" call as S5b/S6): the boilerplate tracks nothing by default (full opt-in RGPD, zero third-party analytics wired, zero data sale), so GPC has nothing to cut today and §7025(f) exempts a no-sale site from the "Do Not Sell" link. Activation hook documented in the full spec below — reuses A.4's `consent_record` / `ConsentService`, ~1-2h when a clone wires `VITE_ANALYTICS_SRC` or sells data.

### M2 — Revenue (the #1 reason to clone a SaaS starter)

- **B.1** Billing via `@better-auth/stripe` ✅ **shipped** (Jul 2026 — see ✅ table; Stripe Checkout + Billing Portal + seat gate + 3-tier entitlements + `/pricing` + `/settings/billing`. 4 billing events → **46 total**. As-built in [`docs/HISTORY.md`](docs/HISTORY.md).)
- **B.2** Feature & quota gating ✅ **shipped** (Jul 2026 — see ✅ table; quota catalog in `ENTITLEMENTS[tier].quotas`; `requireQuota`/`reserveQuota` middleware; `quota_usage` store; `useQuota`/`<QuotaGate>` front; `billing.quota.exceeded` operational event → **47 total**. Dormant + knip-whitelisted. As-built in [`docs/HISTORY.md`](docs/HISTORY.md).)

### M3 — Finish the half-shipped surfaces (backends done — highest value per LOC)

- **C.2** Audit log **front UI** — `/admin/audit-log` page (filters + metadata diff). API + write-path shipped via event-driven.
- **C.5** Webhooks **front UI** + `webhook.test` — `/settings/webhooks` page + public event catalog. API + worker shipped via event-driven.
- **C.6** Account recovery codes UI — BetterAuth backend already supports.
- **A.5** Privacy dashboard `/settings/privacy` — UX hub aggregating A.2/A.3/A.4 + RGPD cards. Refactor-only (composes existing cards).

### M4 — Operate the product + paying customers

- **C.3** Admin & impersonation (BetterAuth `admin` plugin) — real dep (audit write-path) already shipped; every admin action auto-audited the moment it lands (needs `admin.*` events declared, rule §6).
- **C.4** API tokens / PATs — `/settings/tokens`, scoped + expirable, sha256 + per-row salt, `clean_<base58url-32>` prefix for GitHub secret-scanner. Unblocks D.2 + F.1.
- **D.2** OpenAPI auto-docs (`@hono/zod-openapi` + Scalar UI at `/api/docs`) — after PATs ship (customers integrate).
- **D.3** In-app notification center — `<Bell />` + `/settings/notifications`. Handler = 1-line `onEvent(...)` via event-driven foundation.

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

**Why** (M1, bundled): 4 pure-config / Markdown items that share the same context (legal disclosure pages + contractual templates). ~3h total. Each missing one blocks a specific scenario: no sub-processor page = Art. 28 GDPR violation; no accessibility statement = EAA Art. 14 violation since June 28 2025; no DPA template = every EU client demands it at signature; no DORA annex = no fintech/insurance deal can sign since Jan 17 2025.

> **Status — shipped (2026-07-09).** 2 public legal pages + 3 contract templates landed. 0 domain events (pages 100% static, no backend touched) — event count stays at 40. As-built in [`docs/HISTORY.md`](docs/HISTORY.md). Two deferred items: (1) RSS change history + re-acceptance trigger on sub-processor list changes (Art. 28 §2 advance-notice automation — marked next-step in the sub-processor bullet below); (2) accessibility statement auto-update tied to A.6 Lighthouse CI (remains `[ ]`).

**Sub-processor disclosure** (Art. 28 GDPR):

- [x] `apps/app/src/features/legal/sub-processors.config.ts` — typed const `SUB_PROCESSORS` (interface `SubProcessor { name, purpose, region, category, url?, dpaUrl?, status }`). Active: Resend, Cloudflare R2, BetterAuth OAuth. Planned: Stripe, GrowthBook, Umami.
- [x] `apps/app/src/features/legal/sub-processors.{route,page}.tsx` — 4 Cards (What is a sub-processor?, Active sub-processors → shadcn Table, Planned sub-processors → shadcn Table, Change notice Art. 28 §2 30-day notice + `dpo@[domain]`), `last-updated: 2026-07-09`. RSS change history + re-acceptance trigger on sub-processor list changes deferred (next-step).
- [x] Linked via `command-palette.tsx` (2 `LEGAL_ROUTES` entries) + `data-rights.page.tsx` cross-links. Footer link deferred (no global footer yet); `/settings/privacy` links land with A.5.

**Accessibility statement** (EAA Art. 14, mandatory since June 28 2025):

- [x] `apps/app/src/features/legal/accessibility.{route,page}.tsx` — 5 sections EAA Art. 14: Compliance status (WCAG 2.1 AA / EN 301 549 v3.2.1), Known limitations, Technical specifications, Feedback and contact (`accessibility@[domain]`), Enforcement and escalation. Page itself is exemplary a11y (single `<h1>`, `<h2>` section headings, labelled mailto).
- [x] **Complaint procedure** — `accessibility@[domain]` email alias embedded in the Feedback section. Mandatory per EAA — users must have a channel to flag a barrier.
- [x] Linked via command-palette + `data-rights.page.tsx` cross-links. Footer deferred; see sub-processor linking note above.
- [ ] Auto-update mechanism: tied to A.6 Lighthouse CI gate — when audit results change, page reflects the new conformance state.

**Contract templates** (Markdown in `docs/legal/`):

- [x] `docs/legal/DPA-template.md` — Data Processing Agreement covering Art. 28 GDPR clauses: scope of processing, sub-processor list (link to `/legal/sub-processors`), data location, retention, audit rights, sub-processor notice (30 days), incident notification (72h), end-of-contract data return/deletion. Boilerplate clauses + `[CLIENT_NAME]` / `[EFFECTIVE_DATE]` placeholders.
- [x] `docs/legal/DORA-annex-template.md` — Digital Operational Resilience Act annex for fintech/insurance EU clients (mandatory since 17 Jan 2025). Clauses: SLA targets (RPO/RTO mirroring Phase 0.3), audit rights (on-site + remote), data location, exit plan + reversibility, incident reporting (mirror NIS2 24h/72h/1-month), sub-processor concentration (cap on critical sub-processors), insurance proof of cover. Sourced from the 11 mandatory DORA Article 30 contractual provisions.
- [x] `docs/legal/README.md` — index of all legal templates with usage notes ("when a fintech client is in pipeline, send DPA + DORA annex; non-fintech B2B = DPA only") + fintech-vs-B2B decision table + placeholder checklist (`accessibility@[domain]`, `dpo@[domain]`, national accessibility authority per EAA Art. 14).

---

## Cookie consent + Consent management — **Phase A.4**

**Why** (M1 — before any analytics ships): the moment any clone adds analytics (Umami, Plausible, GA), Stripe pixel, intercom, hotjar, anything — without a CNIL-conform banner the deploy is illegal in EU. ePrivacy directive + RGPD Art. 7. Currently the boilerplate has zero consent surface, so it's `clone → add Umami → fine`. Block that. Stamps **policy version from A.2** on every consent record so version bumps invalidate stale consents cleanly.

**Why this is infra, not DDD**: consent *looks* domain-ish, but every rule collapses under the decisive test — `isActive = withdrawnAt == null && expiresAt > now && policyVersion == current` is a WHERE clause; category scope = `categories.includes(cat)`; validity / refusal-cooldown = date comparisons; version-invalidation = the same `version ===` as A.2. No invariant needs an `Aggregate` to defend it. So A.4 is the **same class as A.2**: append-only `consent_record` + a `ConsentService` + a typed category config + GPC/DNT middleware. The boilerplate ships **zero aggregates** — `@packages/ddd-kit`'s `Aggregate` / `ValueObject` / `DomainEvent` stay dormant (not dead: it's a published-lib surface; `Result` / `Option` / `UUID` are used everywhere) until the cloner writes their real product domain. Building an aggregate here just to exercise the kit is backwards — the OpenUp anti-pattern (ratio test/code > 3× = over-engineering).

> **Status — shipped (Jul 2026).** Dual-layer device-scoped (preuve RGPD Art.7§1 = stockage serveur horodaté). 2 events `user.cookie_consent.{granted,withdrawn}` (retention `compliance`) → **compteur 42**. As-built + toutes les décisions dans [`docs/HISTORY.md`](docs/HISTORY.md). **Déviations SOTA vs spec originale** : architecture device-scoped (`subjectId` cookie, `userId` nullable) vs user-centric ; routes `/consents` publiques (`optionalAuth`) vs `/me/consents` (`requireAuth`) ; composants dans `shared/components/` vs `@packages/ui` ; GPC/DNT requalifiés hors scope EU (voir contraintes ci-dessous). **Déféré** : DB hook invalidation `policy_version` (tâche 3), re-prompt cooldown 6 mois comme mécanique séparée (tâche 7, TTL 180j livré via `CONSENT_REFUSAL_TTL_DAYS`), `onEvent` client-side disable (tâche 10, couvert par unmount React via `<AnalyticsScripts>`).

**Decided constraints** (recommandation CNIL consolidée janvier 2026, EDPB 2024 binding decisions):
- Reject-all button **same visual prominence** as accept-all (same size, same level, same color contrast). Single click reject.
- Granular categories: `necessary` (always on, no toggle), `functional`, `analytics`, `marketing`. Each toggleable, default OFF except `necessary`.
- **GPC/DNT** — requalifiés hors scope EU : `Sec-GPC: 1` = signal CCPA/California uniquement (EDPB non contraignant) ; `DNT: 1` = header mort, ignoré. Conformité RGPD assurée par le modèle opt-in (rien tracké sans consentement explicite). Google Consent Mode v2 = hors scope (pas de produit Google dans le stack).
- TTL configurables : `CONSENT_GRANT_TTL_DAYS=180` (durée de validité du consentement accordé) + `CONSENT_REFUSAL_TTL_DAYS=180` (durée de mémorisation du refus, évite le re-prompt immédiat). Durées non figées par la CNIL.
- Withdrawal as easy as granting — `<ConsentSettings />` accessible depuis `<LegalFooter>` (AppShell) + `/settings/privacy` (A.5), single-click withdraw.
- **Dual-layer authoritative** — `cc_sid` httpOnly cookie = lien device→serveur, `consent_record` table = source de vérité horodatée. La réconciliation guest→user se fait au login côté serveur (hook `hooks.after`+`ctx.context.newSession`), sans round-trip client.
- `COOKIE_CONSENT_VERSION` (date-string) — version SSOT dans `@packages/cookie-consent` ; bump → re-prompt.

**Architecture** — infra module, mirror of `modules/policies/` (no domain layer):

```
modules/consents/
  application/
    services/
      consent.service.ts           record(userId, categories, policyVersion, ip, ua) → append row + emitEvent
                                     withdraw(userId, categories?)                    → append withdrawal row + emitEvent
                                     getActive(userId)                                → WHERE withdrawnAt IS NULL AND expiresAt > now AND policyVersion = current
    ports/
      consent-store.port.ts        IConsentStore { insert, findActive } (module-private)
    dto/
      record-consent.dto.ts        zod: { categories: Category[], policyVersion: string }
  infrastructure/
    repositories/
      drizzle-consent.store.ts     §8-instrumented (outer + inner span + capture)
  config.ts                        CONSENT_CATEGORIES = ["necessary","functional","analytics","marketing"] as const + cookie inventory per category
  routes.ts                        POST /me/consents (record) · DELETE /me/consents (withdraw) · GET /me/consents
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

- [x] Drizzle schema `consent_record` + migration `0009_elite_jack_power.sql`. 2 indexes : `(subjectId, expiresAt DESC)` + `(userId, expiresAt DESC)`. `subjectId NOT NULL`, `userId` nullable FK `ON DELETE CASCADE`.
- [x] `modules/consents/` skeleton (`ConsentService` + `IConsentStore` port + `DrizzleConsentStore` + `@packages/cookie-consent` config + routes + module.ts) — infra, mirror de `modules/policies/`.
- [ ] DB hook on `policy_version` change: invalidate all `consent_record` (set `expiresAt = NOW()`). **(déféré — `COOKIE_CONSENT_VERSION` date-based SSOT utilisé à la place)**
- [x] `recordConsent` writes ip + UA from request context (compliance evidence). IP via `resolveClientIp`.
- [x] `<CookieBanner />` + `<ConsentSettings />` components dans `apps/app/src/shared/components/` (symétrie CNIL Reject/Accept, `necessary` non-toggleable, auto-monté dans `app-providers.tsx`). **Déviation** : dans `shared/components/`, pas dans `@packages/ui` (scope app uniquement à ce stade).
- [x] `useConsent(category)` hook dans `apps/app/src/shared/hooks/use-consent.ts`.
- [ ] Auto-decline on `Sec-GPC: 1` / `DNT: 1`. **Requalifié hors scope EU** — GPC = CCPA/US uniquement, DNT = mort. Le modèle opt-in couvre la conformité RGPD sans header-checking.
- [ ] Re-prompt timing: refuse → 6-month cooldown stored in `consent_record.expiresAt`. **(partiellement livré : `CONSENT_REFUSAL_TTL_DAYS=180` par défaut ; la mécanique de re-prompt UX dédiée est déférée)**
- [x] Withdraw all UX: `<LegalFooter>` (monté dans `AppShell`) + `<ConsentSettings>` (accessible partout, `/settings/privacy` via A.5). Single-click withdraw.
- [ ] On `consent.withdrawn(analytics)`, an `onEvent(...)` handler fires client-side `umami.disable()`. **(déféré : `<AnalyticsScripts>` unmount React via `useConsent("analytics")` couvre le cas Umami/Plausible self-hosted)**
- [x] Audit: `user.cookie_consent.{granted,withdrawn}` déclarés dans `@packages/events` (retention `compliance`, payload `subjectId`+`userId?`+`categories`+`policyVersion`) — auto-audité via `AuditEventSubscriber` (règles §6/§7).
- [x] Public `/legal/cookies` page — inventaire cookies par catégorie, from `cookies.config.ts`. Route publique sous `rootRoute`.

**Out of scope (rule 14 — promote on second occurrence)**:

- Per-region rules (US California vs EU vs UK vs Brazil LGPD). Ship the strictest (EDPB) and document override hooks. **GPC honoring promoted to A.7** (CCPA-binding opt-out signal); remaining CCPA-specific UX bolts on later.
- IAB TCF v2.2 framework — heavy, vendor-specific. Skip until an ad-tech use case demands it (most B2B SaaS don't).

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

**Why** (M3 — after consent A.4 + docs A.3 land): composes everything above (consent A.4 + acceptance history A.2 + sub-processors A.3 + RGPD core + sessions). Today RGPD/security/sessions cards are scattered across `/settings/account`. Users (and auditors) want ONE place. Refactor-only — reuses existing cards.

- [ ] `/settings/privacy` page — composes existing components: `<DataExportCard />` (rgpd) + `<RgpdDeletionCard />` (rgpd) + `<ConsentSettings />` (A.4) + `<ActiveSessionsCard />` (security) + `<PolicyAcceptanceCard />` (A.2) + `<DataSourcesCard />` (lists A.3 sub-processors that hold this user's data with last-sync timestamp).
- [ ] Top-right: timestamp "Last data export: never / 2026-04-12", direct download link if export still valid (R2 signed URL).
- [ ] `/settings/account` slims down to identity + security after the move (rectification fields from A.1 stay there, RGPD cards relocate).
- [ ] Add to `SETTINGS_TABS` source with `requires` capability + `requiresOrg: false` (personal scope).

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

**Why bundled**: three hardening layers any public endpoint needs. Shipping them together avoids a 3-pass review of every route. Currently zero rate-limit, default-permissive CSP from `secureHeaders()`, CSRF gated by SameSite-only.

> **Status — S1–S4 shipped (2026-06-13).** Rate-limit core + shared stores + strict CSP + CSRF landed and reviewed (multi-agent SOTA-2026 pass). Three deliberate SOTA deviations vs the original spec below, validated during build:
> - **CSP nonce lives in Caddy, not a Hono middleware.** The SPA is static-served by Caddy; the per-request nonce uses Caddy's native `{http.request.uuid}` placeholder (`templates` module) threaded into the HTML via Vite `html.cspNonce`. No app-server in the static path → no Hono CSP middleware. `/csp-report` is **public** (browsers post reports unauthenticated — HMAC impossible), hardened by IP rate-limit + cross-origin CORP + document-uri origin filter.
> - **CSRF is Origin-allowlist, not double-submit token.** SOTA 2026 (Next.js Server Actions / SvelteKit): validate the unforgeable `Origin` header against the CORS allowlist on unsafe methods. Stateless — no cookie, no `/csrf` endpoint, no front code. Bearer-authed clients (Capacitor) skip (no ambient cookie → no CSRF). The decoupled cross-origin deploy makes the literal `__Host-csrf` double-submit unworkable anyway (cookie unreadable from the app origin).
> - **Trusted Types deferred** to its own story — report-only floods `audit_log` on a non-TT-migrated app, and 2026 browser baseline is still partial (Firefox not stable, Safari only since 26.1).
>
> **Hardening from the SOTA review** (S1/S2 amendment): rate-limit **fails closed on auth-sensitive policies** (a store outage must not silently disable brute-force protection — OWASP A10:2025 / CWE-636), fail-open preserved on the global policy; prod boot **fails hard** if `CORS_ORIGIN` is unset (no silent localhost fallback).
>
> **Documented deployment debt** (see README): `RATE_LIMIT_STORE=memory` is per-replica — switch to `postgres` before horizontal scaling (Redis not yet implemented); `TRUSTED_PROXIES` must be set behind a load-balancer (warn at boot) or every request shares the LB IP (collective lockout). **S4.1 isolated the postgres limiter in a dedicated pg pool** (max:3, 500 ms acquire-timeout) so a flood can't exhaust the app pool; in-memory insurance is deliberately skipped (fail-closed-fast) until a Redis store lands.
>
> **Still pending in C.1** (priority order): **S5b advanced abuse signals (impossible-travel, geo/IP deny-list)** → S6 captcha. (S4.1 store resilience ✅ + S5a abuse quick-wins ✅ shipped — see below.)

### S4.1 — Rate-limiter store resilience — ✅ **SHIPPED**

**Why it mattered**: the only MEDIUM finding from the C.1 SOTA review. The limiter used to share the app's pg pool (`max: 20`) through the global `db` proxy — a sustained flood could exhaust that shared pool → the fail-closed auth policies then 503 (DoS amplification). S4.1 isolated the limiter in a dedicated pg pool **without** an in-memory store (deliberate: `RATE_LIMIT_STORE` stays `postgres`). As-built in [`docs/HISTORY.md`](docs/HISTORY.md).

- [x] **Dedicated pg `Pool`** for the limiter — `new Pool({ max: 3, connectionTimeoutMillis: 500 })` wrapped in a minimal `drizzle(dedicatedPool, { schema: rateLimitSchema })`. Exposed via factory `getRateLimitDbClient()` in `@packages/drizzle` (lazy singleton, `DATABASE_URL` stays encapsulated — the `Pool` is **never** exported). Wired in the `IRateLimiter` binding (`container.ts`) via `storeFactoryFor(env.RATE_LIMIT_STORE, getRateLimitDbClient)` — the client factory is invoked (pool created) only when `RATE_LIMIT_STORE=postgres`.
- [x] **Short acquire timeout** — `connectionTimeoutMillis: 500` on the dedicated pool: a store stall throws in ≤500 ms → `capture` + `Result.fail` → auth policies fail-closed (503) instead of queuing on a saturated pool.
- [x] **Decide `insuranceLimiter`**: **fail-closed-fast** (skip insurance). A real pg outage = whole-app outage anyway, and `RATE_LIMIT_STORE` stays postgres by preference. Revisit only if a separate Redis store lands — then a tiny conservative in-memory insurance for the auth policies only is worth reconsidering.
- [x] **Verify Caddy `Reporting-Endpoints`** emits without literal backticks — confirmed via `caddy adapt`: the resolved header value is `csp-endpoint="…/csp-report"` (backticks are Caddy raw-string delimiters, not leaked to the browser). Note: prod still serves the pre-C.1 CSP (CSP strict + reporting lives on `dev`, not yet released to `main`) — re-`curl -I` prod after the `dev`→`main` merge to confirm the deployed header.

### Rate limiting + abuse prevention

**Relation to BetterAuth** (default-to-the-lib has a boundary here):
- BetterAuth ships a **built-in `rateLimit`** (OSS, default-on in prod) — but it only guards `/api/auth/*`. Our business routes (uploads, `/me/*`, future writes) need the same protection under one envelope, so we **own a single Hono middleware** mounted `app.use("*")` **before** the BetterAuth handler. Since `/api/auth/*` flows through Hono first, it covers auth routes too → **disable BetterAuth's built-in** (`rateLimit: { enabled: false }`) for a single source of truth, one 429 envelope, §8-instrumented store.
- BetterAuth's **Sentinel** plugin (`@better-auth/infra`) does all this + credential-stuffing / impossible-travel / bot+geo-blocking / free-trial-abuse — but it's an **API-key-bound paid cloud SaaS** (Better Auth Infrastructure), which conflicts with the self-hosted / zero-mandatory-SaaS rule. **We mine its threat model (below), never the dependency.**

**Decided shape**:
- **Sliding window** (not token bucket — simpler, no over/under-charge edge cases at boundaries). Wrap `hono-rate-limiter` (battle-tested) rather than hand-roll the window math.
- **Store behind a port** (`IRateLimitStore`, instrumented §8) — in-memory for dev/single-replica; **Redis via the same `secondaryStorage` BetterAuth's plugins consume** the moment you run **2+ replicas** (per-instance in-memory under-counts → Redis mandatory, not optional). Postgres `rate_limit_window` is the no-Redis fallback (shared across replicas, write-per-request cost).
- **Per-route policy**: `requireRateLimit({ key: (c) => c.var.userId ?? c.req.header("CF-Connecting-IP"), windows: [{ ms: 60_000, max: 60 }, { ms: 3600_000, max: 600 }] })` — multi-window stack, fails fast on tightest.
- **Always responds 429 with `Retry-After`** via the central `app.onError` envelope, never 5xx.
- **Auth-burst surface** (sign-in / forgot-password / verify-email submit / 2FA submit / magic-link request): tighter window — `5/15min/IP` baseline.

> **Status**: the rate-limit core below shipped in **S1–S4** via `rate-limiter-flexible` (not `hono-rate-limiter` — deviation validated during build) behind the `IRateLimiter` port. **S5a abuse quick-wins shipped** (credential-stuffing per-account counter, disposable-email, HIBP telemetry — see below). This section keeps the original decided shape for reference; the remaining `[ ]` are the S5b abuse signals and captcha (S6).

- [x] Disable BetterAuth built-in `rateLimit` (`{ enabled: false }`) — replaced by the unified Hono middleware.
- [x] Middleware `apps/api/src/shared/middleware/rate-limit.middleware.ts` (factory) mounted before the BetterAuth handler; wraps `rate-limiter-flexible` behind the `IRateLimiter` port (memory default, Postgres dedicated-pool swappable — `IInstrumentation` NoOp→Sentry pattern).
- [x] Store backend at scaffold: in-memory (single replica) → Postgres `rate_limit(key, points, expire)` via `RateLimiterDrizzle` on a dedicated pool (2+ replicas). Redis `secondaryStorage` deferred until a real multi-replica + DB-pressure need.
- [ ] Captcha hook (Turnstile / hCaptcha free tier — provider-agnostic via `ICaptchaService` port) — invoked when `requireRateLimit` enters "near-cap" state (>80% of window). Optional, env-flagged. **(S6)**
- [x] Front error UX: 429 toast with countdown using `Retry-After` header.

**Abuse-prevention signals — Sentinel's threat model, self-hosted** (build on real abuse signal, not pre-launch; the velocity store + `session.ipAddress` we already persist are the substrate):

> **S5a — quick-wins ✅ shipped** (Jul 2026, OSS only; BetterAuth Sentinel stays excluded as paid SaaS): per-account credential-stuffing counter on `/sign-in` (fail-closed, reuses `security.rate_limit.exceeded` with `policyName: auth-sign-in-account`), disposable/throwaway-email block at sign-up (~90k-domain list + DNS MX check, fail-open → `security.signup.rejected`), HIBP breached-password telemetry on sign-up/reset/change (→ `security.password.breached`). As-built in [`docs/HISTORY.md`](docs/HISTORY.md). **S5b = the calibration-heavy signals below**, deferred until real traffic exists to tune them (false-positive risk: VPN/carrier-NAT for geo, device-fingerprint bypass).

- [x] **Credential-stuffing** — per-account failed-login counter on `/sign-in` → block at M (reuses the rate-limit store). **S5a shipped**; the progressive "challenge at N" step waits on captcha (S6).
- [ ] **Impossible-travel** — flag a sign-in whose geo-IP jumps faster than physically possible vs the last session (we already store `session.ipAddress` + `userAgent`). **(S5b)**
- [ ] **Free-trial abuse** — IP/device-fingerprint heuristic capping accounts-per-visitor (pairs with B.1 "max 1 free team org per user"). **(S5b — the disposable-email block already ships in S5a as the cheap first layer.)**
- [ ] **Geo / suspicious-IP deny-list** — env-driven country/ASN block middleware. Emits `security.*` events (rule §6) → auto-audited. **(S5b)**

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

**Relation to BetterAuth** (default-to-the-lib): BetterAuth ships an **OSS `apiKey` plugin** (`@better-auth/api-key`, self-hostable) covering key generation, hashing, expiry, per-key rate-limit, and `secondary-storage` (Redis) mode. **Evaluate it first** — it likely covers 80% of the list below. Build custom only for what its hooks can't model: the `clean_<base58url-32>` GitHub-secret-scanner prefix, org-scoping via `ScopedRepository`, and `api_token.*` outbox events (§6). If the plugin exposes those seams, wrap it; otherwise hand-roll. The tasks below are the spec the boilerplate needs **regardless** of which path wins.

- [ ] DB schema `api_token(id, userId FK, organizationId FK nullable, name, hashedToken, scopes jsonb, lastUsedAt, expiresAt nullable, createdAt, revokedAt nullable)`. Token shown ONCE at creation, hashed (sha256 + per-row salt) at rest. *(If the `apiKey` plugin wins, this is its `apikey` table + our delta columns.)*
- [ ] Generation: `clean_<base58url-32>` prefix-tagged for grep / leak detection (GitHub secret scanner registers `clean_` prefix).
- [ ] Scopes — typed const `API_SCOPES = ["read:profile", "write:profile", "read:uploads", "admin"] as const`. Per-token subset. Wildcard `*` only for owner-level tokens, gated by `requireOrgPermission({ apiToken: ["create:wildcard"] })`.
- [ ] `requireApiToken` middleware (alternative to `requireAuth`) — accepts `Authorization: Bearer clean_<…>`, hashes incoming, compares, sets `c.var.user` + `c.var.tokenScopes`.
- [ ] `/settings/tokens` UI — create (name + scope picker + optional expiry), list (last-used timestamps), revoke. Created token shown ONCE in modal (copy-to-clipboard, "I've saved it" closes), never persisted client-side.
- [ ] Audit-log entries: `api_token.created`, `api_token.revoked`, `api_token.used` (sampled — log first use per day per token, not every request).
- [ ] Rate-limit with per-token key (Phase C.11 dependency).

---

## Outbound webhooks front UI — **Phase C.5**

**Shipped** (event-driven foundation — as-built in [`docs/HISTORY.md`](docs/HISTORY.md)): `webhook_endpoint` + `webhook_delivery` schema, `WebhookFanoutSubscriber` (org-scoped fanout, idempotency-key dedupe), `WebhookDeliveryWorker` (HMAC `t=,v1=` Stripe-style, AEAD-encrypted secrets, decorrelated-jitter retry → dead-letter, claim-window pattern), replay endpoint, and the full CRUD API `/settings/webhooks` (gated `requireOrgPermission({ webhooks: ["read"|"write"] })`, plaintext secret returned once).

**Remaining (front UI + one event)**:

- [ ] `/settings/webhooks` UI — list + create + edit + delete + view deliveries + replay. API ready.
- [ ] `webhook.test` event type — sent on endpoint creation, surfaces immediate "is the URL reachable" feedback in the UI.
- [ ] Public `<EventTypesTable />` page enumerating every event the SaaS emits — read from `packages/events/src/event-types.ts` (42 events catalogued).

**Deferred**: Webhook proxy (Svix-style) — host-it-yourself first, evaluate Svix past 10k deliveries/day.

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

> **Status — shipped (Jul 2026).** `@better-auth/stripe@1.6.23` + `stripe@22.3.0`. Stripe Checkout (upgrade) + Billing Portal (manage) hosted — no billing backoffice. 4 billing events → **46 total**. As-built in [`docs/HISTORY.md`](docs/HISTORY.md).
>
> **Key deviations from the original spec** (document REALITY, not the plan):
> - **Subscription SSOT = plugin `subscription` table** (webhook-synced by `@better-auth/stripe`). `organization.metadata.plan` is NOT used — the plugin owns the state.
> - **Hybrid catalog**: price + display live in Stripe (each paid Product needs `metadata.tier` = `pro`|`business` matching a key in `ENTITLEMENTS`; `marketing_features` drive pricing bullets). **Entitlements (features, rank, maxMembers) live in typed code** at `apps/api/src/modules/billing/config.ts`. Gate change = code + deploy (reviewable), never a Stripe dashboard edit.
> - **`maxMembers: null` = unlimited** (JSON-safe). `free`=3, `pro`=20, `business`=null.
> - **Standard unlimited-orgs model** — users can create as many team orgs as they want; each is free or paid. No create-org count cap. The ONLY per-org limit is SEATS (gated in `beforeAddMember` + `beforeAcceptInvitation` + `beforeCreateInvitation`).
> - **Env vars**: `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` only. No `STRIPE_PRICE_*` — price IDs come from the Stripe catalog directly.
> - **Events**: 42 → **46** (`billing.subscription.{created,updated,cancelled}` retention `compliance` + `billing.payment.failed` retention `operational`).

**Why**: `@better-auth/stripe` (official, late 2025) wraps customer creation, subscriptions, customer portal, webhooks, DB sync. No more 600 lines of hand-written Stripe glue.

**Pricing model (standard SaaS)** — the as-built shape:

| Org type | Tier | Members | Features | Price |
|---|---|---|---|---|
| Personal | structural (always free, never billed) | 1 (the user) | exempt | $0 |
| Team org | `free` | 3 | — | $0 |
| Team org | `pro` | 20 | audit_log, api | $X/mo |
| Team org | `business` | unlimited (`null`) | audit_log, api, sso | $Y/mo |

Users can create unlimited team orgs. Each is independently `free` (default) or paid. No quota at org-creation time.

**As-built architecture**:

- **Subscription scoped per `organizationId`** — `referenceId` in the Stripe plugin = orgId. `authorizeReference` checks the calling user is owner of the target org. Members inherit the active org's tier.
- **Subscription SSOT = plugin `subscription` table** — webhook-synced by `@better-auth/stripe`. Not `organization.metadata`. `tier` is read from the subscription record via `EntitlementsService.getEntitlements(orgId)`.
- **Hybrid catalog** — price + display in Stripe; entitlements in code:
  - Each paid Stripe Product must have `metadata.tier` = `pro`|`business` (join key to `ENTITLEMENTS`).
  - `marketing_features` on the Stripe Product drives the pricing UI bullets (read via `BillingCatalogService`).
  - `ENTITLEMENTS[tier]` in `apps/api/src/modules/billing/config.ts` is the sole source of features/rank/maxMembers. Never edit gates in Stripe.
- **Gate primitives** (infra, not DDD):
  - API: `requireFeature(flag)` (→ 402 `BILLING_FEATURE_REQUIRED`), `requirePlan(minTier)` (→ 402 `BILLING_PLAN_REQUIRED`), seat gate in `beforeAddMember`/`beforeAcceptInvitation`/`beforeCreateInvitation` (→ 402 `BILLING_SEAT_LIMIT_REACHED`).
  - App: `useEntitlements()` hook — exposes `tier`, `status`, `features`, `maxMembers`, `hasFeature(flag)`, `atLeast(minTier)`, `seatUsage`.
- **No billing backoffice** — Stripe Checkout (upgrade) + Stripe Billing Portal (manage) are fully hosted. `/settings/billing` shows current plan + usage + Upgrade + Manage billing buttons. Public `/pricing` page (logged-out CTA → `/sign-in`).
- **Backend gate is authoritative; UI gate is UX courtesy** — both ship together.

**Tasks**:

- [x] Install `@better-auth/stripe@1.6.23` + `stripe@22.3.0` + `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` in `apps/api/src/shared/env.ts` (zod-validated)
- [x] `apps/api/src/modules/billing/config.ts` — `ENTITLEMENTS` typed const (`Tier`, `Feature`, `Entitlement`), `isTier`, `entitlementsForTier`, `rankOf`, `hasFeature`, `meetsPlan`, `hasSeatAvailable`. Pure config, zero runtime.
- [x] `auth.ts`: declare `stripe()` plugin with `subscription: { enabled: true, plans, authorizeReference }`. Webhook auto-mounted at `/api/auth/stripe/webhook`.
- [x] Seat gate in `beforeAddMember` / `beforeAcceptInvitation` / `beforeCreateInvitation` — calls `EntitlementsService.getEntitlements(orgId)` + `hasSeatAvailable(activeCount, maxMembers)`, throws `402`.
- [x] `useEntitlements()` hook (`apps/app/src/features/billing/hooks/use-entitlements.ts`) — reads active org's entitlements view.
- [x] `/settings/billing` UI: current tier badge, members usage (`X / Y`), `Upgrade` button → Stripe Checkout, `Manage billing` button → Stripe Billing Portal.
- [x] `/pricing` public page — 3-tier table, `marketing_features` bullets from Stripe catalog, CTA routes to `/sign-in` when logged out.
- [x] 4 billing events declared in `@packages/events` + `retention-map` (see `docs/EVENTS.md` billing section) → **46 total**
- [x] **Dev**: `stripe listen --forward-to localhost:3000/api/auth/stripe/webhook` (see README Billing section + `.env.example` `STRIPE_*` placeholders)

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
- [ ] **Impersonation flow** — `authClient.admin.impersonateUser(id)` issues a short-lived impersonation session (default 1h, configurable). Original admin session preserved server-side, restored on `stopImpersonating()`. Front banner non-dismissable, distinct color (`bg-destructive`), visible on every page during impersonation. Start + stop emit `admin.impersonation.{started,stopped}` events → auto-audited via `AuditEventSubscriber`.
- [ ] **Ban / unban** — `authClient.admin.banUser(id, reason)` revokes all sessions and blocks future sign-in (BetterAuth handles the session invalidation). `unbanUser(id)` symmetric. Reason captured in audit log.
- [ ] **Force password reset** — `authClient.admin.setUserPassword(id)` invalidates current sessions, sends magic-link via existing Resend template.
- [ ] Pages in `features/admin/`: `/admin/users` (list, search, filter by org / status / role), `/admin/users/:id` (detail + actions), `/admin/orgs`, `/admin/orgs/:id`.
- [ ] **Front gate** `_admin` layout route inline in `apps/app/src/router.tsx` (id `_admin`, no path) — `beforeLoad` checks `session.user.role ∈ ["admin", "support"]`, **else 404, not 403** (don't leak the existence of `/admin/*` to non-admins).
- [ ] **Never serve `/admin/*` from the public hostname in production** — separate subdomain (`admin.<APP_DOMAIN>`) or env-flagged. Reduces credential-stuffing surface on a known URL.
- [ ] No new DDD here — `admin` lives in `features/admin/` (front) + `modules/admin/` (api), guarded by `requireAdmin`. Same pragmatic shape as gating.

---

## Audit log front UI — **Phase C.2**

**Shipped** (event-driven foundation — as-built in [`docs/HISTORY.md`](docs/HISTORY.md)): `audit_log` schema (append-only, nullable org, soft target FK, retention enum), `AuditEventSubscriber` zero-plumbing auto-write (service-level code emits via `emitEvent`, no separate helper), actor identification (rule #7), outbox payload validation, retention sweeps (Phase 0.6), and the read API `GET /admin/audit-log` (gated `requireOrgPermission({ auditLog: ["read"] })`).

**Remaining (front UI only)**:

- [ ] Page `/admin/audit-log` (admin only, gated by `_admin.tsx`) — filters (actor, action, target, range), each row expandable to a `metadata` diff. API ready.
- [ ] **Tamper-evidence (deferred)** — `prevHash`/`hash` columns already posed in schema; calc off behind `AUDIT_TAMPER_EVIDENCE` flag. Promote when a SOC2 audit demands it (rule 14).

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

_Full as-built log for every shipped phase: [`docs/HISTORY.md`](docs/HISTORY.md). Current inventory: [`docs/FEATURES.md`](docs/FEATURES.md) · guided tour: [`docs/OVERVIEW.md`](docs/OVERVIEW.md)._
