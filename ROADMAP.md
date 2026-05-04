# ROADMAP

Forward-looking integrations, **all SOTA 2026**, **outside DDD** (pragmatic layer: `modules/<x>/infrastructure/`, `modules/<x>/routes.ts`, `features/<x>/hooks/`). DDD stays reserved for the pure business domain (`modules/<x>/domain/`, `modules/<x>/application/use-cases/`).

> Already shipped (Auth, Multi-tenant, Email, Storage, App shell): see [`docs/FEATURES.md`](docs/FEATURES.md) for the inventory and [`docs/HISTORY.md`](docs/HISTORY.md) for the full architectural log.

> **Priority order**: 1. **GDPR / CCPA** (compliance, ships first; boilerplate must be EU-legal day one for any clone). 2. **Vertical-slice layout** (structural refactor; every feature added after must be removable in 5 minutes, not via grep archeology — done before Billing so Billing inherits the contract). 3. Billing. 4. Feature & quota gating. 5. Admin & impersonation. 6. Audit log. 7. i18n. Each section below assumes the ones above it are in place.

---

## Billing — Stripe via the BetterAuth plugin

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

## Feature gating & quota gating — guards layer (post-Billing)

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

## Admin & impersonation — BetterAuth `admin` plugin

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

## Audit log — append-only event trail

**Why**: compliance (SOC2 §CC7.2, GDPR Art. 30, ISO 27001) requires a tamper-evident trail of who did what when. Operational value too — debugging "who changed this user's email at 3am" without `git log`-style detective work. Append-only, scoped by org, never mutated after write.

- [ ] Drizzle schema `audit_log`: `id`, `organizationId` (FK, **nullable** for platform-level events like impersonation), `actorId`, `actorType` (`user` | `admin` | `system`), `action` (snake_case verb, e.g. `user.ban`, `subscription.upgrade`, `org.member.invite`, `data.export.requested`), `targetType` + `targetId` (soft FK, no DB constraint — survives delete), `metadata` (`jsonb`: diff before/after, reason, IP, UA), `createdAt`. **No `updatedAt` / `deletedAt`** — append-only is the contract.
- [ ] **Helper `recordAudit(deps, { action, target, metadata })`** injected via inwire, called **explicitly** from use-cases on state-changing ops. No global ORM hook — rule 6 (explicit DI > magic) applies; magic hooks fire on internal background ops too and pollute the trail.
- [ ] **Phase-1 audited actions (mandatory)**: every `auth.admin.*` (impersonate start/stop, ban, unban, password reset), `subscription.*` (upgrade, cancel, plan change, payment failure), `organization.*` (create, member invite/remove/role change, owner transfer), `user.delete*` (request, cancel, complete — cf GDPR section), `data.export.*`.
- [ ] **Retention** driven by an enum column `retention` on the row. `operational` (90d, debug-grade) vs `compliance` (7y, auth/billing/GDPR-relevant). Cron purges expired `operational` rows; `compliance` rows are immutable for the legal period.
- [ ] Indexes: `(organizationId, createdAt DESC)` + `(actorId, createdAt DESC)` cover the two main read paths.
- [ ] Page `/admin/audit-log` (admin only, gated by `_admin.tsx`) with filters (actor, action, target, range). Each row expandable to show `metadata` diff.
- [ ] **Tamper-evidence (deferred phase 2)** — `prevHash` column chaining each row's hash to the previous one. Detects DB tampering; not crypto-strong but raises the bar. Promote when SOC2 audit demands it (rule 14).
- [ ] **Cross-cutting rule extension**: any new use-case that mutates `user`, `organization`, `subscription`, `member`, `invitation` MUST call `recordAudit(...)` in the same transaction as the write. Reviewer checklist item.

---

## GDPR / CCPA — data deletion + export — **PRIORITY (next up)**

**Status**: ships before Billing, Admin, Audit log, i18n.

**Why ship first**: clean-stack is a boilerplate cloned to start any SaaS. A clone deployed to EU users without Art. 17 (right to erasure) + Art. 20 (data portability) is illegal day one — fines up to 4% of revenue. Adding compliance after launch means retrofitting cascade rules across every table that ships in between (Billing → Stripe customers, Audit log → 7y retention rules, etc.). Ship the cascade clean **before** those tables exist, every future feature inherits the contract.

**Why**: Art. 17 (right to erasure) and Art. 20 (data portability) are mandatory in EU; CCPA mirrors them in California. Both are user-facing rights, not back-office support tickets — build the cascade clean once or pay forever in ad-hoc DB surgery.

**Queue dependency note**: the original draft assumed Inngest for async export. **Pre-Billing scope ships sync** — export endpoint walks tables in-request (under 5s for a fresh-account dataset), streams JSON response. Async + R2 upload + emailed link is a phase-2 upgrade once Inngest lands.

- [ ] **Export endpoint** `POST /me/export` — auth-gated, enqueues a job that walks all tables filtered by `userId` / their orgs, serializes to JSON, uploads to R2 under `<userId>/exports/<uuid>.json`, signs a 7-day download URL, emails the link via Resend template `RESEND_TPL_DATA_EXPORT_*`. **Idempotency-Key on the job** to dedupe double-clicks; rate-limit at 1/24h per user.
- [ ] **Pre-flight ownership gate** (blocks before the request is even accepted) — `GET /me/delete/preflight` returns the list of non-personal orgs where the user is **sole owner** (other members exist but no other owner). UI at `/settings/account` renders a blocking section listing each org with two per-row CTAs: `Transfer ownership` (opens existing transfer-leave dialog scoped to that org) / `Leave org` (deletes the org if last member, else fails — should never happen here since "sole owner with other members" is the entry condition; CTA exists only for the "sole owner, sole member" edge where leaving collapses the org via `afterRemoveMember`). The `Delete account` button stays disabled while the list is non-empty. **Why**: auto-transferring ownership refiles legal/billing responsibility on a member without their explicit consent — same explicit-intent posture as Personal-org deletion (org R5).
- [ ] **Delete endpoint** `POST /me/delete` — auth **+ 2FA-required** (BetterAuth `twoFactor` plugin already enabled) + **server-side re-check of the pre-flight gate** (UI is a courtesy, server is authoritative — refuses with 409 `ACCOUNT_DELETION_BLOCKED` listing offending orgIds if a sole-owner org appeared between preflight read and submit) + **7-day soft-delete grace** (status `pending_deletion`, user can still sign in to cancel — explicit consent UX). After grace window expires, a cron job processes pending deletions:
  - **Personal data wiped**: `user.email`, `user.name`, profile images deleted from R2, all sessions revoked, MFA factors removed, passkeys removed.
  - **Business data depends on org context**: sole owner of an org → **block** deletion until org is transferred or deleted (forces explicit choice in the cancel-grace UI, not silent fail). Member → row anonymized in `member` (`userId → null`, `email → deleted-<uuid>@anonymized.local`).
  - **Stripe**: customer deleted via the BetterAuth Stripe plugin. Refund / proration policy = config decision (out of scope for this section, captured as a billing question).
  - **Audit log entries**: **kept** (legal retention 7y) but `actorId` becomes a tombstone reference; original email replaced with `deleted-<uuid>@anonymized.local`. The trail survives the deletion — that's the compliance promise.
- [ ] **GDPR is the only acceptable soft-delete in the codebase** — `user.deletedAt` + `user.pendingDeletionUntil` are the lone soft-delete columns. Every other table stays hard-delete (rule 14 — no creep, no "while we're at it" soft-deletes elsewhere).
- [ ] **Cancel-deletion UX**: any sign-in during the grace window prompts "Your account is scheduled for deletion in N days. [Cancel deletion] [Continue and sign out]". Cancellation = `audit.user.delete.cancelled`.
- [ ] **Admin overrides** at `/admin/users/:id`: trigger an export on user's behalf (support workflow, audited as `data.export.requested` with `actorType: admin`); cannot cancel a user's deletion request without a documented reason in `metadata.reason` (audit-log enforced).
- [ ] **E2E gate in CI** — Playwright scenario: sign up → upload avatar → request export → fetch export → request delete → simulate grace expiry → verify (a) every `userId` reference is gone or anonymized, (b) audit log retains the chain. Without this gate, deletion silently leaves orphaned rows and the compliance claim is theatre.
- [ ] **Public `/legal/data-rights` page** linked from `/settings/account`, listing exactly what's deleted, what's anonymized, and what's retained (with legal basis per category). Required by GDPR transparency obligations; also good copy for trust.
- [ ] **Audit-log integration** (cf section above) — every transition of the deletion state machine (`requested`, `cancelled`, `grace_expired`, `completed`) gets `recordAudit(...)` with `retention: compliance`.

---

## Vertical-slice layout — front + back alignment for true removability

**Status**: ships **right after GDPR**, before Billing. Foundational refactor — every feature shipped after inherits the "removable in 5 minutes" contract; every feature shipped before (auth, multi-tenant, storage, gdpr) is migrated as part of this section. **Rule already documented in `CLAUDE.md` `## Layout`** — this section is the migration plan, not the design.

**Why ship before Billing**: clean-stack is cloned to start *any* SaaS. Each clone keeps a different subset (a B2C product won't bill api-keys, a tool won't need members invitations, an internal app won't need marketing legal). If a *leaf feature* can't be removed cleanly — `trash` one folder + remove a `registerXxx(c, app)` line + remove route imports — the clone diverges fast. Billing is the next big feature; it must land in vertical-slice form, otherwise we re-pay the refactor cost on every subsequent feature.

**Honest scope — what is and isn't removable**:

- ✅ **Leaf bounded contexts** (gdpr, billing, api-keys, audit log, admin): vertical-slice = clean removal.
- ❌ **Cross-cutting concerns** (auth, multi-tenancy, observability, db, storage): not features, postures. Removing multi-tenancy = re-architecturing every business table's `organizationId`, ditching `ScopedRepository`, the org plugin, access-control, half the UI. No layout fixes that — it's a *clone-time* decision (future `create-clean-stack --no-multi-tenancy` CLI, or branch variants), not a `rm -rf`.

**The two failure modes today**:

1. **Front**: `features/<area>/` mixes *area* (UI shell — `settings/`, `dashboard/`) and *feature* (sub-domain — `account`, `api-keys`, `members`). Removing `api-keys` from `features/settings/_components/`, `_forms/`, `_schemas/`, `_hooks/` requires `git grep` archeology.
2. **Back**: horizontal layout (`domain/`, `application/`, `adapters/`, `routes/` at top level). A bounded context's code is sprayed across 4 sibling folders. Removing GDPR means touching `domain/gdpr*`, `application/use-cases/*-account-deletion*`, `application/dto/*deletion*`, `adapters/repositories/drizzle-gdpr*`, `routes/me.routes.ts`, `routes/internal.routes.ts`, plus DI wiring. No single-folder boundary.

**Six registration sites, no more** — adding a feature touches **only** these (and removing it untouches them):

1. API composition root (`apps/api/src/index.ts`) — `app.route("/xxx", xxxModule.routes)` (or via `registerXxxModule(app)`)
2. API DI root (`apps/api/src/di/container.ts`) — `c = registerXxx(c)`
3. DB schema barrel (`packages/drizzle/src/schema/index.ts`) — `export * from "./xxx"`
4. Capability statement (`@packages/access-control`) — extend `statement` + role policies if the feature has permissions
5. Front nav source (`SETTINGS_TABS`, `NAVIGATION_ROUTES`) — declare `requires` + `requiresOrg`
6. Email template registry (if the feature emits transactional mail)

**Migration sequence** (front first — smaller blast radius, validates naming):

- [x] **Step 0 — define the rule** in `CLAUDE.md` `## Layout` + `## App import direction` + `## App feature anatomy` + `## Don't`.
- [x] **Front step 1 — split `features/settings/`** into top-level `features/<sub-domain>/`. Underscore-private folders dropped. Account composition moved to `features/account/account.route.tsx` (composes `security/` + `gdpr/` library features).
- [x] **Front step 2 — collapse `adapters/` + `common/` + `providers/` into `shared/`**. `shared/api/`, `shared/auth/`, `shared/components/`, `shared/app-providers.tsx`, `shared/env.ts`, `shared/utils.ts`. 4 sub-folders + 2 root files; lean.
- [x] **Front step 3 — code-based routing** (Option C). `routes/` folder + `routeTree.gen.ts` + `@tanstack/router-plugin` deleted. Each feature exposes `<name>Route(parent)` factory in `<name>.route.tsx`; `apps/app/src/router.tsx` defines layouts/gates inline + assembles via `addChildren`. Library features (`security/`, `gdpr/`) stay route-less, composed by `account/`. Feature-scoped queries/mutations relocation to `features/<x>/api/` deferred (current `shared/api/queries+mutations/` remains pragmatic until duplication justifies the split).
- [ ] **Back step 1 — pivot `apps/api/src/` to `modules/<context>/`**: introduce `modules/auth/`, `modules/uploads/`, `modules/organizations/`, `modules/gdpr/`, `modules/email/`. Each contains `domain/`, `application/`, `infrastructure/`, `routes.ts`, `module.ts`. Move existing files via `git mv` to preserve history. Rename `adapters/repositories/`, `adapters/mappers/`, `adapters/services/` → `infrastructure/repositories/`, `infrastructure/mappers/`, `infrastructure/services/` (DDD-canonical naming).
- [ ] **Back step 2 — extract `shared/`**: `apps/api/src/adapters/middleware/` → `apps/api/src/shared/middleware/`; `apps/api/src/common/` → `apps/api/src/shared/`. Anything that's not a bounded context lives in `shared/`.
- [ ] **Back step 3 — `module.ts` per context**: each module exports `registerXxx(c, app)` that does both `.add(...)` (DI) and `app.route(...)` (Hono). `apps/api/src/index.ts` calls them in order. `apps/api/src/di/container.ts` is just the build target. No more flat DI sections — registration is local to each module.
- [ ] **Back step 4 — split DB schema**: `packages/drizzle/src/schema/<context>.ts` files (already largely the case for some — formalize), barrel `index.ts` re-exports. Each module owns its tables. Removing a module = remove the `export *` line + revert the migration.
- [ ] **Removability dry-run** on the smallest module (probably `gdpr` since fresh in memory, or `uploads` if smaller) — delete it end-to-end, run `pnpm ci:check`, document the diff in `docs/HISTORY.md` as the canonical "how to remove a feature" example.
- [ ] **Removability CI gate (phase 2 — deferred until pattern stabilizes)**: script `scripts/check-removability.ts` that picks a random module, snapshots, removes, type-checks, restores. Optional weekly cron in CI; promote to PR-blocking once stable.

**Out of scope (deferred — rule 14)**:

- Plugin manifest / runtime registry / dynamic load — explicitly rejected. Static modules with explicit registration achieve removability without the cost of indirection. Revisit only if a clone needs *runtime* feature toggling (different SKUs same codebase), which is a different problem.
- Workspace package per feature (`packages/feature-billing/`) — extra workspace overhead for a benefit (physical boundary) already met by directory + `eslint-plugin-boundaries` (deferred phase 2).
- `eslint-plugin-boundaries` rules enforcing cross-module isolation — added once the module pattern has settled (premature otherwise; tweaking rules + layout simultaneously is double pain).
- `create-clean-stack` CLI for clone-time variant selection (no-multi-tenancy, no-storage, etc.) — phase 2 once the boilerplate has 3+ adopters asking for it. README documents the manual variant for now.
- Splitting `@packages/ui` per feature — the UI package stays shared; module pivot is an *app-level* concern.

---

## i18n — TanStack Router locale routes + typed catalogs

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

## Marketing site — Astro 5 + Payload 3 (self-hosted, isolated)

**Status**: **deferred / low-priority** — not in the active queue. Triggered only the day a public marketing surface is needed (typically before opening sign-ups to a wider audience). Independent of the dependency chain above — doesn't block / isn't blocked by GDPR, Billing, Admin, Audit, i18n. Re-evaluate the stack at trigger time (CMS landscape moves fast — confirm Payload 3.x + Astro live preview is still SOTA before scaffolding).

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
| Analytics | Umami self-hosted | GDPR-native, <1KB script, no cookie banner needed. Plausible Cloud rejected (paid). |
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
- [ ] **Legal pages**: `/legal/privacy`, `/legal/terms`, `/legal/data-rights` (cf GDPR section above). Stored as `Pages` in Payload — non-tech can update without dev.
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
- **Multi-tenant — `organization` plugin** ✅ Phase 2 (per-org scoping, invitations, roles, slug auto-gen)
- **Email — Resend** ✅ Phase 1 (typed templates, idempotency, retry, DNS hardening)
- **Storage — R2 + MinIO** ✅ Phase 1 (presign / PUT-direct / confirm flow, owner-scoped keys)
- **App shell — top-nav + ⌘K palette** ✅ (sticky header, contextual settings tabs, command palette, custom logo mark)
