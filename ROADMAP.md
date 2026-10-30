# ROADMAP

What is left for clean-stack, then one line per shipped phase. Every phase follows the same shape: title, status, date, why, scope, references. As-built detail lives in [`docs/HISTORY.md`](docs/HISTORY.md), the current inventory in [`docs/FEATURES.md`](docs/FEATURES.md) and the guided tour in [`docs/OVERVIEW.md`](docs/OVERVIEW.md). DDD stays reserved for the pure business domain.

Event catalog today: 92 events, 35 public, 57 internal (counted from `packages/events/src/event-types.ts` and `visibility-map.ts`). Phases below give the events they added, never a running total.

> **Boilerplate target**: clone, then ship any SaaS without re-coding plumbing. Anything below that is not shipped is friction the cloner inherits, which is why the open list stays short.

---

## What's left

The plumbing a SaaS boilerplate owes its cloner is shipped: auth and MFA, multi-tenant with a capability SSOT, RGPD Art. 17 and 20, cookie consent, policy versioning, billing and quota gating, security perimeter, admin and impersonation, API tokens, audit log, outbound webhooks, in-app notifications, durable email delivery, enterprise SSO (OIDC and SAML) with SCIM provisioning, a typed i18n rail (`en` and `fr`), the event rail and a Railway reference deploy.

What remains is short on purpose. **Everything not listed here was cut**: a boilerplate that carries a wishlist of twelve unbuilt phases reads as unfinished when it is not.

| Order | Phase | Status | What | Why it survived the cut |
|---|---|---|---|---|
| 1 | **Phase J** | Delivered | Front redesign on shadcn/ui, one design system in `@packages/ui`: sober tool direction, every screen rebuilt | The cloner's first impression is the app shell |
| 2 | **Tooltips pass** | Delivered | Tooltips and contextual help everywhere they add something: icon-only buttons, truncated values, disabled controls, technical terms | A dense pro tool must explain itself in place; today most icons and truncated values say nothing on hover or focus |
| 3 | **Review pass** | Delivered | End-to-end review of the server surface, the customer screens and the clone path, defects fixed | The only thing between "feature-complete" and "clone-ready" |
| 4 | **C.1 remainder** | Delivered | S5b behavioural signals and S6 captcha hook | Deferred for calibration, not abandoned: needs real traffic |
| 5 | **Phase K** | Open | Standalone back office: its own app and host, staff permissions, step-up, four-eyes, platform operations | Today the operator works inside the customer app with one all-or-nothing gate, which does not survive a second staff member |

**Cross-cutting, at first consumer**: one-click unsubscribe (RFC 8058: Gmail and Yahoo require it for bulk senders) and SPF, DKIM and DMARC `p=reject` (DNS, doc only).

**Cut and not coming back**: marketing site (E.2), status page and SLO dashboards (D.1), SOC2 checklist (D.4), generated OpenAPI spec and Scalar UI (D.2: the generation is cut, not the documentation, since `/api/v1` is documented by hand in [`docs/PUBLIC-API.md`](docs/PUBLIC-API.md), which a three-route surface keeps honest more cheaply than a generator), Capacitor shell (F.1), feature flags (F.2), GPC (A.7), NIS2 readiness, and the per-phase "deferred" micro-items. Each was a per-clone decision, a third-party service to wire, or an ambition with no substrate to exercise it. Git history has the specs if one becomes real.

**Out of scope**: HIPAA tooling, real-time WebSocket bus, third-party app marketplace, A/B testing framework, IAB TCF v2.2.

---

## Front redesign from scratch: **Phase J**

- **Status**: delivered. Emails stayed out: their templates do not share the theme tokens. Radix stays the primitive base.
- **Date**: before the review pass (the review reads the redesigned surface, not the one being replaced).
- **Why**: every screen wore the shadcn defaults it was scaffolded with, so a clone looks like every other shadcn app until someone spends a week on it. The shell also carries measured defects: at 390 px and 768 px the top-nav header overflows the viewport by 33 px (the user menu is pushed off screen on `/settings`), and the theme provider renders an inline `<script>` that React reports as an error on every navigation.
- **Scope**: a design direction chosen once (typography, color tokens light and dark, radius, density, motion) and expressed only as tokens in the global theme of `@packages/ui`; shadcn/ui components reinstalled from the current registry and left unmodified where possible; every screen of `apps/app` rebuilt on them (auth, onboarding, dashboard, settings tabs, admin, legal, command palette, emails if their templates share the tokens). Built with the repo's frontend skills: `frontend-design` for the direction, `lean-ui` on every touched file, `polish-interface-details` and `animate-interface` for states and motion, `stress-test-ui` for empty, long and error data, `review-animations` before closing.
- **Out of scope**: new features, copy rewrites beyond what a layout change forces, a marketing site (E.2 stays cut).
- **Done when**: no screen overflows at 390, 768 and 1440 px (measured, not eyeballed); the browser console is clean on every route; the accessibility gate stays green with no new allowlist entry; no inline style and no color or spacing value outside the theme tokens (grep); `docs/SURFACE.md` parity test unchanged; screenshots of each screen in both themes attached to the PR.
- **References**: `packages/ui/CLAUDE.md`, `apps/app/CLAUDE.md`, `apps/app/a11y/README.md`.

---

## Tooltips pass

- **Status**: delivered.
- **Date**: after Phase J, before the review pass.
- **Why**: icon-only buttons, truncated values and disabled controls leave the user guessing, and a sober interface hides more behind icons than a loud one.
- **Scope**: an inventory of every screen, then the existing `Tooltip` primitive on icon-only buttons, truncated values (full value on hover and focus), disabled controls (why it is disabled), technical terms and status badges, plus keyboard shortcuts where one exists. Every text goes through `t()` with locale parity.
- **Out of scope**: new features, onboarding tours, tooltips repeating a visible label.
- **Done when**: no icon-only control and no truncated value lacks a tooltip (checked screen by screen); tooltips open on keyboard focus as well as hover, and touch screens lose no information; the accessibility gate stays green.

---

## Review pass

- **Status**: delivered. Admin writes and their events commit together since Phase K lot 2.
- **Date**: after Phase J.
- **Why**: the shipped surface has been audited by phase and by tooling, never read end to end by its owner.
- **Scope**: delegated review of the server surface, the customer screens and the clone path, each defect verified then fixed with its test.
- **References**: [`docs/SURFACE.md`](docs/SURFACE.md), [`docs/FEATURES.md`](docs/FEATURES.md).

---

## Security perimeter remainder: **Phase C.1**

- **Status**: delivered, every signal off by default. Open: the thresholds are starting points, to calibrate on real traffic.
- **Date**: Oct 2026, ahead of real traffic, so that a cloner only has to switch the flags on.
- **Why**: both items need real traffic to calibrate their false-positive rate, hence off by default (VPN and carrier NAT break geo heuristics; device fingerprints are bypassable).
- **Scope**:
  - **Behavioural signals (S5b)**: impossible travel on sign-in (`session.ipAddress` and `userAgent` are already stored), accounts-per-visitor cap, env-driven country and ASN deny-list. Each emits a `security.*` event.
  - **Captcha hook (S6)**: `ICaptchaService` port (Turnstile or hCaptcha free tier), invoked when `requireRateLimit` enters a near-cap state (above 80 % of the window), env-flagged. The widget is left to the cloner ([`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md)).
- **References**: [Security perimeter C.1](docs/HISTORY.md#security-perimeter-rate-limit--csp--csrf--phase-c1--jun-2026).

---

## Back office: **Phase K**

- **Status**: open. Lots 1 to 5 and 6a of 7 delivered. Lot 6a: accounts, organizations, audit log, team and approvals screens in `apps/admin` (operations stays a placeholder until 6b), permission overrides with expiry through `GET`, `POST` and `DELETE /admin/staff/:id/overrides`, step-up and four-eyes as action `staff.permission_override`, 2 events `admin.staff.override_{set,revoked}`, impersonations ended when a write loses `users.impersonate`, a manager denied `staff.manage` no longer counts in the last-manager guard, live updates through notifications SSE, staff forms and audit sheet moved to `@packages/web-kit`, gate extended in `apps/admin/a11y/screens.spec.ts`, real step-up proved with a real code. Lot 5: `apps/admin` shell on its own host, nav from the `permissions` of `GET /admin/me`, denied page, `ADMIN_URL` and `AUTH_COOKIE_DOMAIN` validated at boot, sign-in round trip through the app with `ADMIN_URL` as the only external redirect target, shared step-up hook, stricter CSP, `apps/admin/a11y/` with its own CI job, surface walker over both apps, staff with 2FA in the dev seed. Screens are placeholders until lot 6. Lot 3: `admin_approval`, `202 {approvalId}` on permanent ban, staff role change and staff revocation when `ADMIN_APPROVAL_ENABLED` (off by default), decide and cancel routes, expiry on the sweep rail, bell and SSE to approvers and requester, `check:admin-approval`, 6 events `admin.approval.{requested,decided,cancelled,expired,executed,failed}`. No staff route deletes an account yet, so account deletion has no gate and `users.delete` stays unused. Lot 2: `ban`, `unban` and session revocation write in one unit of work with their event, a ban also ends the sessions the banned user impersonates through; `POST /admin/step-up` and `ADMIN_REAUTH_REQUIRED` on permanent ban, staff changes, impersonation start and SSO enforcement off, code dialog in `apps/app`, refused replay, `check:admin-atomicity`, `check:admin-step-up`, 2 events `admin.step_up.{verified,failed}`. Lot 1: staff roles and permissions behind every `/admin/*` route, `session.staff`, staff list, role and revoke routes, `check:admin-staff`, 3 events `admin.staff.{added,role_changed,revoked}`; `PUT /admin/users/:id/role` and `admin.user.role_changed` removed. Open: operations screens (lot 6b), return from an impersonated session and removal from `apps/app` (lot 7).
- **Date**: after the review pass, which reads the surface this phase moves.
- **Why**: admin screens live in `apps/app`, on the customer host and session, behind one gate (`requirePlatformAdmin`) that grants everything or nothing. A cloner with a support hire must hand out the right to ban and to impersonate along with the right to read an account.
- **Model**: Erebor, the OpenUp back office, kept to what any SaaS needs. Its moderation stack stays out.
- **Scope**:
  - **Separate app**: `apps/admin` on its own host, same API under `/admin/*`, origin guard, strict CSP, `noindex`. The admin screens of `apps/app` move there, no copy stays behind.
  - **Staff permissions**: a typed permission catalog, roles as code bundles, per-person grant or deny with expiry. The UI is built from the permissions the API returns, never from a role check. The last manager cannot be removed and nobody changes their own access.
  - **Staff identity**: mandatory MFA through the existing auth, domain-restricted SSO as an env option. Access is rechecked on every request, so a removed role cuts at once.
  - **Step-up**: sensitive actions require a recent sign-in and answer a typed error that opens a confirmation dialog.
  - **Four-eyes**: a pending decision approved by a different person, with expiry and an override that requires a note, applied to account deletion, mass ban and role change. Thresholds are configuration.
  - **Screens**: inbox of what waits for the team, accounts and organizations with a 360 detail and staff notes, audit viewer with chain verify, platform operations (dead outbox events and their requeue, Stripe event replay, job heartbeats), plan override with an end date, team, `Ctrl K` palette, saved views, live updates over SSE.
  - **Rails**: every staff action emits a typed event carrying `actorUserId` in the same transaction, like any other state change. Today ban, role change and impersonation commit on the auth library's connection and emit afterwards, so a failed emit leaves the action with no audit row; this phase closes that.
- **Out of scope**: moderation cases and lanes, QA calibration, moderator wellbeing, holds and takedowns, linked-account clusters, content workspace, growth prospects, integrations rollout, AI support assistant, Discord commands: all OpenUp business.
- **Done when**: no admin route or screen remains in `apps/app`; a test covers each permission against each staff route, refusal included; the accessibility gate and `docs/SURFACE.md` parity cover the new app; a real two-person approval and a real step-up are proved in the browser at 390, 768 and 1440 px.
- **References**: [`docs/FEATURES.md`](docs/FEATURES.md), `apps/api/src/modules/admin/`, `apps/api/src/shared/middleware/staff-guards.ts`.

---

## Shipped phases

Status is shipped for every row. "Detail" links the as-built record.

| Phase | When | Why | Scope | Detail |
|---|---|---|---|---|
| **Auth (BetterAuth)** | Jan 2026 | One identity layer wired once | Sign-in and sign-up, MFA, passkey, magic link, bearer, `customSession`, email hooks | [HISTORY](docs/HISTORY.md#auth-betterauth-end-to-end--phase-1--phase-2-organization) |
| **Email (Resend port and adapter)** | Jan 2026 | Typed templates behind a port | Template registry, idempotency, retry, EU region option | [HISTORY](docs/HISTORY.md#email-resend-dashboard-templates--phase-1) |
| **Multi-tenant and access-control SSOT** | Apr 2026 | Tenancy and permissions decided in one place | Organization plugin, Personal org self-heal, capability predicate on front and back, `<Can>` | [HISTORY](docs/HISTORY.md#multi-tenant-betterauth-organization-plugin--phase-2) |
| **Storage (S3-compatible)** | Apr 2026 | Uploads without trusting the client | Presign, PUT, confirm, owner-scoped key, server-verified `HeadObject` (R2 in prod, SeaweedFS in dev) | [HISTORY](docs/HISTORY.md#storage-cloudflare-r2-prod--seaweedfs-dev-opt-in--phase-1) |
| **RGPD core (Art. 17, Art. 20)** | Apr 2026 | Erasure and export are legal duties | 7-day grace, 2FA gate, sole-owner preflight, cron sweep, `/legal/data-rights` | [HISTORY](docs/HISTORY.md#rgpd--ccpa-data-deletion-art-17--export-art-20--phase-1) |
| **Vertical-slice layout** | May 2026 | One feature, one folder per side | `features/<x>/` on the front, `modules/<x>/` on the back | [`CLAUDE.md`](CLAUDE.md) |
| **Clone-ability bootstrap** | May 2026 | Clone to running in minutes | `pnpm bootstrap`, SeaweedFS `storage` profile, `db:push --force`, source-only internal packages | [`scripts/bootstrap.sh`](scripts/bootstrap.sh) |
| **Event-driven foundation** | May 2026 | Every state change observable | Outbox, LISTEN/NOTIFY dispatcher, audit-log API, webhooks API, HMAC and AEAD delivery worker with decorrelated jitter, retention sweeps | [HISTORY](docs/HISTORY.md#event-driven-foundation-outbox--dispatcher--audit-log--webhooks--may-2026), [EVENTS](docs/EVENTS.md), [EVENT_PIPELINE](docs/EVENT_PIPELINE.md) |
| **Phase 0: Foundation closeout** | May 2026 | Be operable before being featureful | Health probes, backups and DR, Sentry, removability dry-run, retention sweeps, Railway reference deploy | [HISTORY](docs/HISTORY.md#observability-sentry-with-iinstrumentation-port--phase-04--may-2026) |
| **App shell and command palette** | Jun 2026 | One navigation model | Top nav, settings tabs, view-transition theme, command palette | [HISTORY](docs/HISTORY.md#app-shell-top-nav--k-command-palette-) |
| **A.1: Profile and NIST password** | Jun 2026 | Rectification (Art. 16) and a modern password policy | `ProfileCard`, `ChangePasswordCard`, HIBP k-anonymity, 15 characters minimum, ban list, 2 compliance events | [HISTORY](docs/HISTORY.md#right-to-rectification-art-16--nist-800-63b-4--phase-a1--jun-2026) |
| **A.2: Privacy and Terms versioning** | Jun 2026 | Prove which version a user accepted | `@packages/policies`, `policy_acceptance`, `/legal/accept` gate, `requireCurrentPolicies`, 1 event | [HISTORY](docs/HISTORY.md#privacy--terms-versioning--phase-a2--jun-2026) |
| **C.1: Security perimeter (S1 to S5a)** | Jun to Jul 2026 | Abuse resistance by default | Fail-closed rate limit with IETF headers, strict CSP through Caddy nonce, Origin-based CSRF, per-account counter, disposable-email block, HIBP telemetry, 5 `security.*` events. S5b and S6 delivered later, see above | [HISTORY](docs/HISTORY.md#security-perimeter-rate-limit--csp--csrf--phase-c1--jun-2026) |
| **A.3: Compliance docs bundle** | Jul 2026 | Documents a buyer asks for | `/legal/sub-processors`, `/legal/accessibility`, DPA and DORA templates, `docs/legal/README.md` | [HISTORY](docs/HISTORY.md#compliance-docs-bundle--phase-a3--jul-2026) |
| **A.4: Cookie consent** | Jul 2026 | Opt-in consent with proof | `@packages/cookie-consent`, `consent_record`, `/consents` routes, banner, gate, analytics loader, 2 events | [HISTORY](docs/HISTORY.md#cookie-consent--consent-management--phase-a4--jul-2026) |
| **B.1: Billing (Stripe)** | Jul 2026 | Revenue without a billing backoffice | Checkout, Billing Portal, seat gate, 3-tier `ENTITLEMENTS` (`apps/api/src/shared/entitlements.ts`), `/pricing`, `/settings/billing`, 4 events | [HISTORY](docs/HISTORY.md#billing-stripe-subscriptions--featureseat-gating--phase-b1--jul-2026) |
| **B.2: Quota gating** | Jul 2026 | Limits enforced atomically | `requireQuota`, `reserveQuota`, `quota_usage`, `useQuota`, `<QuotaGate>`, 1 event. Dormant and knip-whitelisted, guide in [`docs/QUOTA-GATING.md`](docs/QUOTA-GATING.md) | [HISTORY](docs/HISTORY.md#quota-gating--phase-b2) |
| **C.2: Operator audit log** | Jul 2026 | Cross-org forensics for the operator | `GET /admin/audit-log`, tamper-evidence hash chain, `requirePlatformAdmin`, `/admin/audit-log` page, 1 event | [HISTORY](docs/HISTORY.md#operator-audit-log-cross-org-read--tamper-evident-hash-chain--admin-zone--phase-c2--jul-2026) |
| **C.5: Webhooks UI and event catalog** | Jul 2026 | Customers integrate without asking us | `/settings/webhooks`, delivery timeline, `/developers/events`, SSRF guard, dual-secret rotation, auto-disable, 4 events | [HISTORY](docs/HISTORY.md#outbound-webhooks-sota-hardening-plans-1-and-2--front-ui--public-catalog-plan-3--phase-c5--jul-2026) |
| **C.6: Account recovery codes UI** | Jul 2026 | MFA without lockout | `RecoveryCodesCard`, backup-code fallback on `/two-factor`, `BackupCodeUsedNotifier`, rate limit, 2 events | [HISTORY](docs/HISTORY.md#account-recovery-codes-ui--phase-c6--jul-2026) |
| **A.5: Privacy dashboard** | Jul 2026 | One place for a user's data rights | `/settings/privacy` hub, danger zones moved next to their subject | [HISTORY](docs/HISTORY.md#privacy-dashboard--phase-a5--jul-2026) |
| **D.5: Email delivery queue** | Aug 2026 | Fan-out without one HTTP call per email | `email_message` queue, `EmailDeliveryWorker`, `@packages/emails`, batch send, retention sweep, 1 event | [HISTORY](docs/HISTORY.md#email-delivery-queue-durable-outbox--batch-worker--in-repo-templates--phase-d5--aug-2026) |
| **Option and Result back-fill** | Aug 2026 | One convention for absence and failure | `Result.ok` overloads, ports return `Option<T>` with `null` stopping at the store | [HISTORY](docs/HISTORY.md#option--result-convention-back-fill--aug-2026) |
| **C.3: Admin and impersonation** | Aug 2026 | Support without asking for credentials | `modules/admin/`, audited ban, role change and session actions, justified impersonation, server-side blocklist, banner, transparency email, 7 events | [HISTORY](docs/HISTORY.md#admin--impersonation-betterauth-admin-plugin--phase-c3--aug-2026) |
| **C.4: API tokens** | Aug 2026 | Customers call the API without a session | `clean_` tokens with HMAC and pepper rotation, org scope, `/settings/tokens`, `/api/v1` outside `AppType`, GitHub secret scanning route, `visibility-map.ts`, 3 events plus 2 preference audit events | [HISTORY](docs/HISTORY.md#api-tokens--personal-access-tokens--phase-c4--aug-2026) |
| **A.6: Accessibility gate** | Aug 2026 | Back the published WCAG 2.1 AA claim | `apps/app/a11y/` axe over 7 pages in both colour schemes, landmark and focus assertions, first PR-triggered CI, 7 defects fixed | [HISTORY](docs/HISTORY.md#accessibility-gate-axe-in-ci--phase-a6--aug-2026) |
| **D.3: In-app notification center** | Aug 2026 | Persistent inbox beside email | `modules/notifications/`, bell, preference cascade, SSE signal stream, fan-out inside the dispatch transaction, 2 crons | [HISTORY](docs/HISTORY.md#in-app-notification-center--phase-d3--aug-2026) |
| **C.7: SSO and SCIM** | Aug 2026 | Unblock enterprise procurement | `@better-auth/sso` and `@better-auth/scim`, `/settings/sso`, enforce-SSO, Keycloak profile in [`docs/SSO-LOCAL.md`](docs/SSO-LOCAL.md), 13 events | [HISTORY](docs/HISTORY.md#enterprise-sso-oidc--saml--scim-provisioning--phase-c7--aug-2026) |
| **E.1a: i18n foundation** | Aug 2026 | A missing key is a compile error | `@packages/i18n` typed catalogs, locale from cookie then `user.locale` and never from the URL, `PUT /me/locale`, 1 event | [HISTORY](docs/HISTORY.md#i18n-foundation-typed-catalogs-locale-outside-the-url--phase-e1a--aug-2026) |
| **E.1b: i18n extraction** | Aug 2026 | Retire the partial-translation carve-out | 520 catalog keys per locale over 71 rewired files, three permanent exclusions (legal prose, `EVENT_DESCRIPTIONS`, sub-processor register) | [HISTORY](docs/HISTORY.md#i18n-extraction-retiring-the-partial-translation-carve-out--phase-e1b--aug-2026) |
| **Email queue debt closeout** | Aug 2026 | Queue correctness | Idempotency-key collision fixed, deletion confirmation enqueued inside the wipe transaction, per-recipient keys, `failed` rows purged on their own cutoff | [HISTORY](docs/HISTORY.md#email-delivery-queue-debt-closeout--aug-2026) |
| **D.6: Sweep rail instrumentation** | Aug 2026 | No dark background jobs | Spans over every `/internal/sweep-*` run, shared `purgeBatchWithTimeout`, `setSpanAttributes` on the port, nested deadlines and a fenced lease on `sweep_lock` | [HISTORY](docs/HISTORY.md#sweep-rail-instrumentation--phase-d6--aug-2026) |
| **G.1: Toolchain refresh** | Aug 2026 | The version floor is a feature | pnpm 11.24, Node 24.20, Bun 1.4.0, TypeScript 7, Postgres 18, file-based routing | [HISTORY](docs/HISTORY.md#toolchain-refresh-pnpm-node-bun-typescript-7-postgres-18-file-based-routing--phase-g1--aug-2026) |
| **H.1: Back and front surface parity** | Sep 2026 | No capability without a screen, no screen without a route | `apps/api/src/shared/surface/` route map (74 routes, 55 with a front consumer, 19 declared UI-less), `docs/SURFACE.md`, `requireCurrentPolicies` mounted on business routes, 1 event | [HISTORY](docs/HISTORY.md#back--front-surface-parity--phase-h1--sep-2026) |
| **Dependency refresh: better-auth 1.7** | Sep 2026 | Take a breaking plugin family on purpose | better-auth family on 1.7.6, SCIM moved to managed connections (breaking: directories must be reconnected), 1 event | [HISTORY](docs/HISTORY.md#dependency-refresh-better-auth-17--sep-2026) |
| **Rules review pass** | Sep 2026 | Every file checked against the house rules | PR #70, 149 commits: failed results roll units of work back, a failing first drain no longer crashes the API, audit gaps closed, 2 events | [HISTORY](docs/HISTORY.md#rules-review-pass--sep-2026) |
| **Dependency refresh Oct 2026** | Oct 2026 | The version floor is a feature the cloner inherits | Node 26 LTS, Bun 1.4.4, pnpm 12, better-auth 1.7.14, stripe 23 and four other majors | [HISTORY](docs/HISTORY.md#dependency-refresh-oct-2026--oct-2026) |
| **Phase I: Resync on the OpenUp foundations** | Oct 2026 | Kit, guardrails, telemetry hygiene, transactions and outbox delivery hardened from a sister project | Kit combinators and `mockPort`, `check:boundaries` and catalog parity, telemetry scrub and ordered shutdown, ambient unit of work with no `tx` anywhere, outbox by lease with named idempotent handlers and dead replay, 1 event | [HISTORY](docs/HISTORY.md#resync-on-the-openup-foundations--phase-i--oct-2026) |
| **Queue lease alignment** | Oct 2026 | Phase I debt closed: the three delivery queues share one model | Email queue and webhook delivery claim by lease with the database clock, settle guarded by the claimed attempt, a replayed `dead` email and `dead_letter` webhook, release on stop, `check:email-lease`, `check:webhook-lease`, no new event | [HISTORY](docs/HISTORY.md#queue-lease-alignment--oct-2026) |

---

## Cross-cutting rules

1. **No DDD for these integrations**: `modules/<context>/infrastructure/services/*` on the api side, `features/<x>/hooks/*` and `shared/api/` on the app side. If a concept becomes domain (a `Subscription` with its own rules, say), promote it into `modules/<context>/domain/` then.
2. **Env validated by Zod** in `apps/api/src/shared/env.ts` (api side) and `apps/app/src/shared/env.ts` (app side).
3. **Webhooks** live in the owning module's `routes.ts` (`POST /webhooks/<provider>`), with signature verification before any processing.
4. **Secrets** are never committed: `.env.local` (gitignored), a secret manager in production.
