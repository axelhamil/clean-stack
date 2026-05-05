# Modules

Each module is a vertical slice. Removable in minutes via a documented contract. Cross-cutting ports stay in `shared/ports/` with NoOp adapters always shipped, so dropping a module never breaks call sites.

This file doubles as a **value sheet for client proposals**. Each module is priced as "what a competent senior dev (solo or small studio) would realistically charge to wire it cleanly on a client engagement, given that the underlying libraries (BetterAuth, shadcn, Resend SDK, AWS SDK, etc.) already do 70-80% of the work."

**These are NOT inflated consultancy SOW prices.** A boilerplate doesn't replace 6 months of build-from-scratch — it replaces the wiring, the architecture decisions, the data scrubbing details, the removal contracts, the doc work. That's real value but it's bounded.

## Pricing principle

- Anchored on French/EU senior TJM €600-900/day × realistic ship time (not "with full SOW, design review, change management").
- Estimates assume the dev knows the libraries. The price is for **integrating + architecting + testing + documenting**, not for learning BetterAuth.
- Single fourchette per module, not low/high consultancy. Lower bound = experienced solo dev shipping fast. Upper bound = same dev being thorough on tests + docs.

---

## Shipped modules — value already in the box (v2.0+)

| Module | Realistic value | Time |
|---|---|---|
| **Auth** (BetterAuth singleton wired Bun-native + 2FA + passkey + magic-link + bearer + customSession + email hooks idempotents) | **€800 – €1 500** | 2-3j |
| **Multi-tenant + access-control SSOT** (organization plugin, Personal org auto-creation/self-heal, capability-based predicate api/route/UI, `<Can>`, `useAuthorization`, `requireOrgPermission`) | **€1 000 – €1 800** | 3-4j |
| **Email** (Resend port + adapter, template registry typed, idempotency, retry, EU region option, SPF/DKIM/DMARC deploy doc) | **€400 – €700** | 1j |
| **Storage S3-compatible** (R2/MinIO, three-step presign→PUT→confirm, owner-scoped key, server-verified `HeadObject` on confirm, boot-time fail-hard) | **€800 – €1 500** | 2j |
| **RGPD complet** (Art. 17 erasure with 7-day grace + Art. 20 portability + 2FA-gated + sole-owner preflight + automated cron sweep + `/legal/data-rights` Art. 13/14) | **€2 500 – €4 000** | 5-7j |
| **DDD-kit** (Result, Option, Entity, Aggregate, ValueObject, UUID, WatchedList, BaseRepository, ScopedRepository, IUnitOfWork, BaseDomainEvent, EventDispatcher, AppErrorException, 263 vitest cases) | **€1 500 – €2 500** | 4-5j |
| **UI shadcn-pure + theme** (full registry + custom primitives `NavLink`, `ListRow`, `FormTextField`, `DestructiveActionDialog`, `BackupCodeList`, `QrCodeFrame`, `BrandLink`, `TextLink` + view-transitions theme toggle + typography exports) | **€600 – €1 200** | 2j |
| **App shell** (Vite + React 19 + TanStack Router code-based with `lazyRouteComponent` 2-file pattern + intent prefetch + view transitions + AppProviders + 4 pathless gates + settings layout + command palette ⌘K + org switcher + auth devtool) | **€1 500 – €2 500** | 3-4j |
| **Monorepo tooling** (pnpm 10 + Turborepo TUI with `with: ["type-check"]` + Biome 2 + Husky + commitlint conventional + semantic-release with `breaking: true` precedence + jscpd + knip all-workspaces + zero-warning pre-push) | **€600 – €1 000** | 2j |
| **AI-pair ready** (`CLAUDE.md` root + sub-CLAUDE.md per layer auto-loaded by Claude Code + `docs/HISTORY.md` + `docs/CRON.md` + `docs/INTEGRATIONS.md` + `docs/FEATURES.md`) | **€300 – €600** | 1j |

**Subtotal Core (shipped)**: **€10 000 – €17 300** of senior-dev value already in the repo on day zero. ~25-35 days of focused senior work compressed into a clone.

---

## Roadmap modules — committed value to ship

| Phase | Module | Realistic value | Time |
|---|---|---|---|
| 0.2 | **Health probes** (`/livez` + `/readyz` + `/startupz` IETF format, registry pattern, graceful shutdown, asymmetric cache) | **€500 – €900** | 1-2j |
| 0.3 | **Backups + DR** (daily `pg_dump` cron, R2 lifecycle 30d/1y cold, monthly automated restore-test, RPO/RTO doc, PITR doc) | **€1 000 – €1 800** | 2-3j |
| 0.4 | **Observability stack** (Sentry api+app removable, OpenTelemetry auto-instrumentation, Prometheus `/metrics`, 3 ports + NoOp default, RGPD scrubbing, source maps CI, release tracking) | **€2 500 – €4 000** | 5-6j |
| A.1 | **Profile + NIST 800-63B-4 password baseline** (rectification UI, email re-verification, avatar upload, HIBP screening, min length 15/8 with MFA, ban complexity rules) | **€1 200 – €2 000** | 3-4j |
| A.2 | **Privacy policy / Terms versioning** (DB schema, version constants, `requireCurrentPolicies` middleware, `/legal/accept` diff view) | **€600 – €1 000** | 1-2j |
| A.3 | **Compliance docs bundle** (sub-processor disclosure, accessibility statement EAA, DPA template, DORA annex template) | **€400 – €800** | 1j |
| A.4 | **Cookie consent + DDD Consent aggregate** (CNIL/EDPB-conform banner, granular categories, `Sec-GPC`/`DNT` auto-decline, version-stamped record, first real Aggregate consumer) | **€2 000 – €3 500** | 4-5j |
| A.5 | **Privacy dashboard** (`/settings/privacy` aggregating consent + last export + sessions + data sources + acceptance history) | **€600 – €1 000** | 1-2j |
| A.6 | **E2E gates Playwright + Lighthouse a11y CI** (full legal chain, WCAG 2.1 AA gate ≥95) | **€1 200 – €2 000** | 3j |
| B.1 | **Billing Stripe complet** (`@better-auth/stripe`, customer portal, webhooks idempotents, dunning, invoice automation, plan config) | **€3 000 – €5 000** | 6-8j |
| B.2 | **Feature & quota gating** (config-driven `PLANS`, `useEntitlements()`, `requireFeature()`, `requireSeat()`) | **€600 – €1 000** | 1-2j |
| C.1 | **Security perimeter** (sliding-window rate-limit per IP/user, captcha on auth-burst, strict CSP with nonce, CSRF on non-BetterAuth POST routes) | **€1 200 – €2 000** | 3j |
| C.2 | **Audit log** (append-only event trail, feeds Admin/RGPD/Billing) | **€1 500 – €2 500** | 3-4j |
| C.3 | **Admin & impersonation** (BetterAuth `admin` plugin, `/admin/*` separate hostname, audit-logged actions) | **€1 500 – €2 500** | 3-4j |
| C.4 | **API tokens / PATs** (`/settings/tokens`, scoped + expirable, sha256 + per-row salt, GitHub secret-scanner prefix) | **€1 000 – €1 800** | 2-3j |
| C.5 | **Outbound webhooks** (HMAC-signed, retry + dead-letter, replay UI, scoped per org) | **€2 000 – €3 000** | 4-5j |
| C.6 | **Account recovery codes** (UI for the BetterAuth `twoFactor` codes already supported server-side) | **€200 – €400** | 0.5j |
| C.7 | **SSO SAML/OIDC + SCIM provisioning** (BetterAuth `sso` plugin + SCIM endpoint + audit-logged provisioning) | **€5 000 – €8 000** | 10-12j |
| D.1 | **Status page + SLO dashboards + alerting** (Cachet/Astro, Grafana SLO consuming 0.4 `/metrics`, Sentry → Slack/PagerDuty, runbook-linked) | **€1 500 – €2 500** | 3-4j |
| D.2 | **OpenAPI auto-docs** (`@hono/zod-openapi`, Scalar UI at `/api/docs`) | **€400 – €700** | 1j |
| D.3 | **Notification center** (persistent inbox `<Bell />`, `/settings/notifications`, transactional vs marketing per category) | **€1 200 – €2 000** | 3j |
| D.4 | **SOC2 Type II readiness checklist** (mapping shipped controls, Vanta/Drata-ready) | **€600 – €1 000** | 1-2j |
| E.1 | **i18n** (TanStack locale routes + Lingui, full string refactor, fallback locale) | **€1 500 – €2 500** | 3-4j |
| E.2 | **Marketing site** (Astro 5 + Payload 3 self-hosted, separate deploy, content modeling, blog) | **€2 500 – €4 000** | 5-7j |
| F.1 | **Capacitor mobile shell** (`apps/mobile/` wrapping `apps/app` build, bearer auth, push channel) | **€2 000 – €3 500** | 4-5j |
| F.2 | **Feature flags GrowthBook** (self-hosted, decouple deploy from release, A/B harness) | **€600 – €1 000** | 1-2j |

**Subtotal Roadmap**: **€36 300 – €60 600** committed to ship.

---

## Total value-in-box once roadmap is shipped

**Core + Roadmap = €46 300 – €77 900** of realistic senior-dev value packaged.

That's ~3-5 months of focused senior work compressed into a clone. Honest, defensible to clients, no inflated SOW pricing.

---

## Future commercial model — boilerplate one-time license

When clean-stack is commercialized as a product (ShipFast / Bullet Train / Makerkit positioning), the price is a **fraction of the realistic delivered value**:

- ShipFast charges €199 against ~€10-15k of value (~1.5%).
- Makerkit charges €499-999 against ~€15-25k of value (~3%).
- Bullet Train charges €1499 against ~€25-40k of value (~4%).

Applying the same ratio bands to clean-stack's €46k–€78k value:

- **1.5% floor** (ShipFast aggressive entry) → **€699 – €1 200** one-time.
- **3% market median** → **€1 400 – €2 300** one-time.
- **4% premium** (Bullet Train upper) → **€1 800 – €3 100**, only justified with included support / customization.

**Recommended initial positioning**: single tier at **€699 – €999** lifetime license, lifetime updates within current major. Reasoning:
- Anchors near Makerkit's lower tier — signals "more architecturally serious than ShipFast, less than Bullet Train premium"
- Clean round number, easy to anchor against the €50-80k value delivered ("you save 50-100× the price on day one")
- Single tier eliminates funnel friction — the whole stack is the product
- Premium tier (~€1 999) only when a course / community / 1-on-1 onboarding is included — pure license alone doesn't justify it

**À la carte module sales** are **not recommended** at the boilerplate-license stage. ShipFast-style buyers want everything; segmenting by module slows the funnel. À la carte makes sense only for a future hosted/managed iteration of clean-stack.

---

## License & redistribution

Commercial license per buyer (covers solo + team-of-≤10). Buyers can ship products built on clean-stack without restriction. They cannot redistribute the boilerplate itself or sell forks. License agreement template in `docs/legal/LICENSE-COMMERCIAL.md` (placeholder — to be populated when commercialization launches).
