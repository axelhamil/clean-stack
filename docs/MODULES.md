# Modules

Each module is a vertical slice. Removable in minutes via a documented contract. Cross-cutting ports stay in `shared/ports/` with NoOp adapters always shipped, so dropping a module never breaks call sites — they fall through to no-op silently.

This file doubles as a **client-facing value sheet**. Each module is priced as "what a senior dev team would charge to spec, build, test, document, and harden it from scratch on a client engagement." Prices are anchored to French/EU senior-dev daily rates (€600–1 200/day TJM) × the realistic time-to-ship a production-grade, removable, future-proof implementation. They are NOT the price of the boilerplate itself — that's a separate one-time license model (see bottom of file).

**Use case for these prices**: when proposing a project, you can show a line-by-line value breakdown. The client sees that the boilerplate already delivers €X of plumbing on day zero — your invoice is for the remaining business logic, not for re-building auth + multi-tenant + storage from scratch.

## Pricing principle

- **Lower bound** = what a competent senior dev / small studio would charge if commissioned to deliver this module **alone** with the same architecture quality (port + adapter, removable, tested, documented).
- **Upper bound** = what an enterprise consultancy (Theodo, OCTO, Zenika) would invoice for the same scope with formal specs, design reviews, and SOW.

The point isn't to bill these prices — it's to make the value visible. clean-stack's competitive moat is that it ships this stack in hours instead of months.

---

## Shipped modules — value already in the box (v2.0+)

| Module | Value delivered | Notes |
|---|---|---|
| **Auth complet** (BetterAuth singleton, 2FA, passkeys, magic-link, bearer mobile-ready, email-and-password, mandatory verification, customSession with org role) | **€4 000 – €7 000** | 1-2 weeks senior dev. Includes Bun-native wiring (no Node shim), template-driven email hooks, idempotency keys, `auth.$Infer.Session` typing kept end-to-end. |
| **Multi-tenant + access-control SSOT** (organization plugin, Personal org auto-creation/self-heal, capability-based predicate mirrored api/route/UI, `requireOrgPermission`, `<Can>`, `useAuthorization`) | **€3 500 – €6 000** | Multi-tenant from day one is the most expensive class of refactor when retrofitted. Already shipped, schema-locked. |
| **Email** (Resend port + adapter, template registry typed, idempotency keys, retry, provider-side suppression, EU region option documented) | **€1 500 – €2 500** | Includes the SPF/DKIM/DMARC deploy doc + Google/Yahoo Feb 2024 mandates note. |
| **Storage S3-compatible** (R2 prod / MinIO dev, three-step presign→PUT→confirm, owner-scoped key prefix, server-verified `HeadObject` on confirm, boot-time fail-hard) | **€3 000 – €5 000** | Three-step is non-negotiable on R2 (no Presigned POST). Confirm is the actual enforcement gap that 80% of boilerplates ignore. |
| **RGPD complet** (Art. 17 erasure with 7-day grace + Art. 20 portability + 2FA-gated deletion + sole-owner preflight check + automated cron sweep + `/legal/data-rights` page Art. 13/14) | **€6 000 – €10 000** | Single most valuable module for EU clientele. The legal + UX + state-machine + cron is ~2-3 weeks of senior work. EU-deployable on signature. |
| **DDD-kit primitives** (Result, Option, Entity, Aggregate, ValueObject, UUID, WatchedList, BaseRepository, ScopedRepository, RepoScope, IUnitOfWork, BaseDomainEvent, EventDispatcher, AppErrorException) | **€4 000 – €7 000** | 263 vitest cases. Zero external runtime deps. Used by every application layer in the project. |
| **UI shadcn-pure + theme** (full shadcn registry + custom primitives `NavLink`, `BrandLink`, `TextLink`, `ListRow`, `FormTextField`, `FormCheckboxField`, `DestructiveActionDialog`, `BackupCodeList`, `QrCodeFrame` + view-transitions theme toggle + typography exports) | **€2 500 – €4 000** | Shadcn purity discipline (no `className` color drift, slots respected, `data-slot` on every primitive) is what differentiates a usable design system from a Tailwind soup. |
| **App shell** (Vite 8 + React 19 + TanStack Router code-based with lazy chunks + intent prefetch + view transitions + AppProviders + pathless gates `_guest`/`_protected`/`_shell`/`_org-scope` + settings layout + command palette ⌘K + org switcher + theme toggle + auth devtool) | **€4 500 – €7 500** | Code-based routing without `routeTree.gen.ts`, the 2-file `lazyRouteComponent` pattern, and the gate hierarchy are 1-2 weeks of work most teams skip and end up with a giant `router.tsx`. |
| **Monorepo tooling** (pnpm 10 + Turborepo TUI with `with: ["type-check"]` + Biome 2 strict + Husky + commitlint conventional + semantic-release with `breaking: true` precedence + jscpd + knip all-workspaces + zero-warning pre-push pipeline) | **€2 500 – €4 000** | Setting this up properly takes a week and most projects never bother. Pre-push enforces it; CI is green by construction. |
| **AI-pair ready** (`CLAUDE.md` root + sub-CLAUDE.md per layer auto-loaded by Claude Code + `docs/HISTORY.md` architectural log + `docs/CRON.md` + `docs/INTEGRATIONS.md` + `docs/FEATURES.md`) | **€2 000 – €4 000** | Unique on the 2026 boilerplate market. The sub-CLAUDE.md system means an AI agent picks up project rules instantly — saves dozens of hours of onboarding/correction across the project lifetime. |

**Subtotal Core (shipped)**: **€33 500 – €57 000** of senior-dev value already in the repo on day zero.

---

## Roadmap modules — committed value to ship

Each module ships with the same architecture discipline (vertical slice, port + adapter, removable in minutes). Value-delivered estimates assume the same standard.

| Phase | Module | Value delivered |
|---|---|---|
| 0.2 | **Health probes** (`/livez` + `/readyz` + `/startupz` IETF draft-inadarei format, registry pattern, graceful shutdown wired to readyz, asymmetric cache, self-cancelling timeout) | **€1 500 – €2 500** |
| 0.3 | **Backups + DR** (daily `pg_dump` cron, R2 lifecycle 30d/1y cold, monthly automated restore-test, `docs/DISASTER-RECOVERY.md` with RPO/RTO, PITR doc, R2 versioning + delete protection) | **€2 500 – €4 000** |
| 0.4 | **Observability stack** (Sentry api+app removable, OpenTelemetry auto-instrumentation, Prometheus `/metrics`, 3 ports + NoOp default, data scrubbing RGPD, source maps CI, release tracking, EU region option) | **€5 000 – €8 500** |
| A.1 | **Profile + NIST 800-63B-4 password baseline** (rectification UI, email re-verification flow, avatar upload, HIBP screening, min length 15/8 with MFA, ban complexity rules, ban forced rotation) | **€3 000 – €5 000** |
| A.2 | **Privacy policy / Terms versioning** (DB schema, version constants, `requireCurrentPolicies` middleware, `/legal/accept` diff view, sign-up inline acceptance) | **€1 500 – €2 500** |
| A.3 | **Compliance docs bundle** (sub-processor disclosure typed config + page, accessibility statement EAA-conform, DPA template Markdown, DORA annex template Markdown) | **€1 500 – €2 500** |
| A.4 | **Cookie consent + DDD Consent aggregate** (CNIL/EDPB-conform banner, granular categories, `Sec-GPC`/`DNT` auto-decline, 6-month re-prompt, version-stamped consent record, first real Aggregate consumer of `@packages/ddd-kit`) | **€4 500 – €7 500** |
| A.5 | **Privacy dashboard** (`/settings/privacy` aggregating consent + last export + sessions + data sources + acceptance history) | **€1 500 – €2 500** |
| A.6 | **E2E gates Playwright + Lighthouse a11y CI** (full legal chain coverage, WCAG 2.1 AA gate ≥95 score, 0 a11y violations blocks merge to main) | **€3 000 – €5 000** |
| B.1 | **Billing Stripe complet** (`@better-auth/stripe`, customer portal, webhooks idempotents, dunning, invoice automation, plan config, seat-based + per-org pricing) | **€7 000 – €12 000** |
| B.2 | **Feature & quota gating** (config-driven `PLANS`, `useEntitlements()`, `requireFeature()`, `requireSeat()` middleware) | **€1 500 – €2 500** |
| C.1 | **Security perimeter** (sliding-window rate-limit per IP/user, captcha on auth-burst, strict CSP with nonce, CSRF on non-BetterAuth POST routes) | **€3 000 – €5 000** |
| C.2 | **Audit log** (append-only event trail, compliance + ops, feeds Admin/RGPD/Billing, SOC2 §CC7.2 + ISO 27001 prerequisite) | **€3 500 – €5 500** |
| C.3 | **Admin & impersonation** (BetterAuth `admin` plugin, `/admin/*` separate hostname, audit-logged actions, RGPD overrides) | **€3 500 – €5 500** |
| C.4 | **API tokens / PATs** (`/settings/tokens` UX, scoped + expirable, sha256 + per-row salt, `clean_<base58url-32>` GitHub secret-scanner prefix) | **€2 500 – €4 000** |
| C.5 | **Outbound webhooks** (HMAC-signed, retry + dead-letter, replay UI, scoped per org, exponential backoff) | **€4 500 – €7 000** |
| C.6 | **Account recovery codes** (UI for the BetterAuth `twoFactor` codes already supported server-side) | **€500 – €1 000** |
| C.7 | **SSO SAML/OIDC + SCIM provisioning** (BetterAuth `sso` plugin + SCIM endpoint + audit-logged provisioning events) | **€15 000 – €25 000** |
| D.1 | **Status page + SLO dashboards + alerting** (Cachet/Astro `status.<domain>`, Grafana SLO dashboards consuming 0.4 `/metrics`, Sentry → Slack/PagerDuty alerts, runbook-linked) | **€4 000 – €7 000** |
| D.2 | **OpenAPI auto-docs** (`@hono/zod-openapi`, Scalar UI at `/api/docs`, generated from existing route schemas) | **€1 000 – €2 000** |
| D.3 | **Notification center** (persistent inbox `<Bell />`, `/settings/notifications` preferences, transactional vs marketing per category) | **€3 000 – €5 000** |
| D.4 | **SOC2 Type II readiness checklist** (mapping shipped controls to `CC6.x`/`CC7.x`/`CC8.x`, Vanta/Drata-ready `docs/SOC2-CHECKLIST.md`) | **€1 500 – €2 500** |
| E.1 | **i18n** (TanStack locale routes + Lingui, every UI string refactored once, fallback locale logic) | **€3 000 – €5 000** |
| E.2 | **Marketing site** (Astro 5 + Payload 3 self-hosted, separate deploy, content modeling, blog) | **€5 000 – €8 000** |
| F.1 | **Capacitor mobile shell** (`apps/mobile/` wrapping `apps/app` build, bearer auth via secure storage, push channel) | **€4 500 – €7 500** |
| F.2 | **Feature flags GrowthBook** (self-hosted, decouple deploy from release, A/B harness) | **€1 500 – €2 500** |

**Subtotal Roadmap**: **€84 500 – €144 500** of senior-dev value committed.

---

## Total value-in-box once roadmap is shipped

**Core + Roadmap = €118 000 – €201 500** of senior-dev value packaged.

This is the realistic ceiling. A single buyer who'd commission every module from a French/EU consultancy would spend in this range, possibly 2–3× more if going through Big-4 / tier-1 ESN.

---

## Future commercial model — boilerplate one-time license

When clean-stack is commercialized as a product (ShipFast / Bullet Train / Makerkit positioning, **not** mission/consulting), the price is a **fraction of the delivered value**, not an hourly rate:

- ShipFast charges €199 against ~€15-20k of value delivered (~1% ratio).
- Bullet Train charges €1499 against ~€30-50k of value delivered (~3-5%).
- Makerkit charges €499-999 against ~€20-30k of value delivered (~2-4%).

Applying the same ratio bands to clean-stack's €100k–€200k value delivered:

- **1% floor** (ShipFast-style aggressive entry) → **€999** one-time.
- **2-3% market median** → **€1 999 – €4 999** one-time, single tier or split into 2-3 tiers (Solo / Team / Enterprise).
- **5% premium** (Bullet Train upper tier) → **€7 999 – €9 999**, justified only with included support / customization.

**Recommended positioning when launching**: single tier at **€1 999** lifetime license, lifetime updates within current major. Reasoning:
- Anchors above ShipFast/Makerkit so positioning signals "more complete, more architecturally serious"
- Stays below Bullet Train's premium tier (clean-stack doesn't include a course or community — yet)
- Round number, easy to anchor against the €100k+ value delivered ("you save 50× the price on day one")
- Single tier eliminates "which one do I need" friction — the whole stack is the product

**À la carte module sales** are **not recommended** at the boilerplate-license stage. Clients buying ShipFast want everything; segmenting by module slows the funnel. À la carte makes sense only if a future SaaS-style hosted version of clean-stack ships (B2B platform, not a license).

---

## License & redistribution

Commercial license per buyer (covers solo + team-of-≤10). Buyers can ship products built on clean-stack without restriction. They cannot redistribute the boilerplate itself or sell forks. License agreement template in `docs/legal/LICENSE-COMMERCIAL.md` (placeholder — to be populated when commercialization launches).
