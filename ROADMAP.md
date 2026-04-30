# ROADMAP

Forward-looking integrations, **all SOTA 2026**, **outside DDD** (pragmatic layer: `adapters/`, `routes/`, `_hooks/`). DDD stays reserved for the pure business domain (`domain/`, `application/use-cases/`).

> Already shipped (Auth, Multi-tenant, Email, Storage, App shell): see [`docs/FEATURES.md`](docs/FEATURES.md) for the inventory and [`docs/HISTORY.md`](docs/HISTORY.md) for the full architectural log.

> **Priority order**: 1. **GDPR / CCPA** (compliance, ships first — boilerplate must be EU-legal day one for any clone). 2. Billing. 3. Feature & quota gating. 4. Admin & impersonation. 5. Audit log. 6. i18n. Each section below assumes the ones above it are in place.

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
- [ ] `requireCreateOrg` middleware (`apps/api/src/adapters/middleware/billing.middleware.ts`) composed on `auth.api.organization.create` interceptor — when user already owns ≥ 1 free non-personal org, throw 402.
- [ ] `requireSeat` middleware composed on org member-invite flow (front route or auth-plugin override).
- [ ] `useEntitlements()` hook (`apps/app/src/adapters/hooks/use-entitlements.ts`) reading active org + plan from existing queries.
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
- [ ] **Front gate** `routes/_admin.tsx` (pathless layout) — `beforeLoad` checks `session.user.role ∈ ["admin", "support"]`, **else 404, not 403** (don't leak the existence of `/admin/*` to non-admins).
- [ ] **Never serve `/admin/*` from the public hostname in production** — separate subdomain (`admin.<APP_DOMAIN>`) or env-flagged. Reduces credential-stuffing surface on a known URL.
- [ ] No new DDD here — `admin` lives in `features/admin/` (front) + `routes/admin/*` (api), guarded by `requireAdmin`. Same pragmatic shape as gating.

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

## i18n — TanStack Router locale routes + typed catalogs

**Why**: most i18n stacks ship as runtime plugins that crash production with missing keys at the worst moment. Bake locale into routing (`/en/...`, `/fr/...`), enforce keys at build time, detect on the server. Zero "Translation missing" string ever shipped.

- [ ] Install `@lingui/core` + `@lingui/react` + `@lingui/cli` (chosen for CLDR plurals + AST extraction; alternative: `next-intl` if SSR streaming becomes a concern)
- [ ] Locale-aware route segment: `routes/$lang/_app/**` with TanStack `parseParams` validating against the supported list (`["en", "fr"]`)
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

## Cross-cutting rules

1. **No DDD for these integrations** — `adapters/services/*` on the api side, `adapters/*` + `_hooks/*` on the app side. If a concept becomes domain (e.g. a `Subscription` with its own rules), promote it into `domain/` then.
2. **Env validated by zod** in `apps/api/common/env.ts` and `apps/app/src/common/env.ts`.
3. **Webhooks**: all under `routes/webhooks/<provider>.ts`, mandatory signature verification before any processing.
4. **Secrets**: never committed, `.env.local` (gitignored) + 1Password/Doppler in production.

---

## Shipped phases

Full architectural log preserved in [`docs/HISTORY.md`](docs/HISTORY.md):

- **Auth — BetterAuth (end-to-end)** ✅ Phase 1 + Phase 2 (organization plugin)
- **Multi-tenant — `organization` plugin** ✅ Phase 2 (per-org scoping, invitations, roles, slug auto-gen)
- **Email — Resend** ✅ Phase 1 (typed templates, idempotency, retry, DNS hardening)
- **Storage — R2 + MinIO** ✅ Phase 1 (presign / PUT-direct / confirm flow, owner-scoped keys)
- **App shell — top-nav + ⌘K palette** ✅ (sticky header, contextual settings tabs, command palette, custom logo mark)
