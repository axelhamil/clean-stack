# ROADMAP

What is left for clean-stack, then one line per shipped phase. Every phase follows the same shape: title, status, date, why, scope, references. As-built detail lives in [`docs/HISTORY.md`](docs/HISTORY.md), the current inventory in [`docs/FEATURES.md`](docs/FEATURES.md) and the guided tour in [`docs/OVERVIEW.md`](docs/OVERVIEW.md). DDD stays reserved for the pure business domain.

Event catalog today: 85 events, 35 public, 50 internal (counted from `packages/events/src/event-types.ts` and `visibility-map.ts`). Phases below give the events they added, never a running total.

> **Boilerplate target**: clone, then ship any SaaS without re-coding plumbing. Anything below that is not shipped is friction the cloner inherits, which is why the open list stays short.

---

## What's left

The plumbing a SaaS boilerplate owes its cloner is shipped: auth and MFA, multi-tenant with a capability SSOT, RGPD Art. 17 and 20, cookie consent, policy versioning, billing and quota gating, security perimeter, admin and impersonation, API tokens, audit log, outbound webhooks, in-app notifications, durable email delivery, enterprise SSO (OIDC and SAML) with SCIM provisioning, a typed i18n rail (`en` and `fr`), the event rail and a Railway reference deploy.

What remains is short on purpose. **Everything not listed here was cut**: a boilerplate that carries a wishlist of twelve unbuilt phases reads as unfinished when it is not.

| Order | Phase | Status | What | Why it survived the cut |
|---|---|---|---|---|
| 1 | **Phase I** | In progress | Resync on the OpenUp foundations in five lots (I.1 to I.5) | Closes the gaps in kit, guardrails, telemetry hygiene, transactions and outbox delivery |
| 2 | **Phase J** | Open | Front redesign from scratch on shadcn/ui, one design system in `@packages/ui` | The cloner's first impression is the app shell; today it is a generic default with known mobile defects |
| 3 | **Review pass** | Open | Full manual review of the shipped surface, owned by @axelhamil | The only thing between "feature-complete" and "clone-ready" |
| 4 | **C.1 remainder** | Open | S5b behavioural signals and S6 captcha hook | Deferred for calibration, not abandoned: needs real traffic |

**Cross-cutting, at first consumer**: one-click unsubscribe (RFC 8058: Gmail and Yahoo require it for bulk senders) and SPF, DKIM and DMARC `p=reject` (DNS, doc only).

**Cut and not coming back**: marketing site (E.2), status page and SLO dashboards (D.1), SOC2 checklist (D.4), generated OpenAPI spec and Scalar UI (D.2: the generation is cut, not the documentation, since `/api/v1` is documented by hand in [`docs/PUBLIC-API.md`](docs/PUBLIC-API.md), which a three-route surface keeps honest more cheaply than a generator), Capacitor shell (F.1), feature flags (F.2), GPC (A.7), NIS2 readiness, and the per-phase "deferred" micro-items. Each was a per-clone decision, a third-party service to wire, or an ambition with no substrate to exercise it. Git history has the specs if one becomes real.

**Out of scope**: HIPAA tooling, real-time WebSocket bus, third-party app marketplace, A/B testing framework, IAB TCF v2.2.

---

## Resync on the OpenUp foundations: **Phase I**

- **Status**: in progress, I.1 and I.2 shipped, I.3 next.
- **Date**: Oct 2026.
- **Why**: OpenUp, a sister project on the same stack, hardened five foundations after clean-stack diverged from the shared Afterlive lineage. Today clean-stack has a thinner kit, layering enforced only by convention, telemetry that can carry PII, a transaction parameter threaded through every port, and an outbox that holds locks during handlers and loses user handlers on a throw. Each lot below buys one architectural property.
- **Scope**: five ordered lots, each its own branch off `dev` (`refactor/phase-i-1-kit` to `refactor/phase-i-5-outbox`) and its own PR merged as a merge commit. Not ported because they are OpenUp-specific: a per-module outbox, `RouteGuards`, `HttpResponse`, `PgSingleFlight`, `packages/audit`, `dist` builds, typed entity ids, the `DomainEventHandler` class, admin replay of dead events.
- **Rules for every lot**: each lot ends on the full chain (`pnpm ci:check`, `turbo run build type-check test`, `check:duplication`, `check:unused`, plus `check:boundaries` from I.2) and its real-database checks, then the 5-agent end-of-lot review (Opus for I.4 and I.5). Doc debt moves in the same commit as the code that changes the rule.
- **References**: root [`CLAUDE.md`](CLAUDE.md) rules 6 to 8, [`docs/EVENTS.md`](docs/EVENTS.md), [`docs/EVENT_PIPELINE.md`](docs/EVENT_PIPELINE.md), the `events-outbox` skill.

### I.1: Kit and test helpers ✅ Oct 2026

- **Why**: a kit with `map`, `flatMap`, `match`, `Option.toResult`, a monotonic `uuidv7`, event ids and JSON-based value-object equality removes hand-rolled glue in every module, and typed test doubles (`mockPort`) replace per-file `mock.module` wiring.
- **Scope**: `Result` combinators and a typed `Result.all`; `Option.toResult`, `tryMap`, `equals`; `UUID.parse` and monotonic `uuidv7`; optional `eventId` on domain events (reused as the outbox row id); `sameJson` for value objects; an error type parameter on `BaseRepository` and `ScopedRepository`; `mockPort` and `mockInstrumentation` behind a `@packages/test/bun` subpath. Purely additive.
- **Depends on**: Dependency refresh merged.
- **Done when**: every new primitive has a named scenario in the `ddd-kit` vitest suite, `pnpm --filter api type-check` and `pnpm --filter api test` pass with no existing caller touched, and the 4 existing `BaseDomainEvent` subclasses compile unchanged.

### I.2: Architecture guardrails ✅ Oct 2026

- **Why**: layering that lives only in `CLAUDE.md` rots; a rule that fails the build does not. Orphan events (declared, never emitted) are the recurring trap of root rule 6.
- **Scope**: `dependency-cruiser` rules (no cross-module import, pure domain and application layers, packages never import apps, no circular dependency) wired into pre-push and CI as `check:boundaries`; a framework-free `source-scan` helper in `@packages/test`; four layering tests (no throw in domain and application, domain import allowlist, routes never write to the database, environment read only through `shared/env`); a catalog parity test that fails on any event type nobody emits.
- **Depends on**: I.1 (`source-scan` lives beside the new test helpers).
- **Done when**: `pnpm check:boundaries` exits 0 with `0 dependency violations` locally and in CI; two deliberate violations (a cross-module import, a `@packages/drizzle` import in `application/`) each make it exit 1 naming the rule, shown in the PR text; the 4 layering tests and 2 parity tests pass; every allowlist entry carries a reason; `no-circular` is an error, or the remaining cycles are listed here.

### I.3: Telemetry hygiene and ordered shutdown

- **Why**: a Drizzle failure message embeds the query parameters, so a swallowed email address can reach Sentry through the exception text; and a process killed mid-drain loses in-flight work and the last telemetry batch.
- **Scope**: scrub exception text, messages and breadcrumbs (cut after `params:`, strip query strings, mask emails, drop console breadcrumbs); `flush(timeoutMs)` on `IInstrumentation`; `runShutdown` running ordered steps (grace, HTTP stop, webhook delivery, email delivery, outbox dispatcher, notification hub, database pool, telemetry flush) under a global deadline, with an explicit `Bun.serve` handle; an `HttpHeartbeat` pinging `<url>/start`, `<url>` and `<url>/fail` around the cron sweep.
- **Depends on**: I.1 (`mockPort`), I.2 (boundaries gate).
- **Done when**: the scrub tests show no `params:` text and no email in `exception.values`, `message` or breadcrumbs; the shutdown tests prove order, exit 1 on a failed or timed-out step, exit 1 with a flush on the deadline and exit 0 only when every step finished; a manual `SIGTERM` against `bun run dev` shows the steps in order and exit 0 in under 5 s idle; `bun --hot` still reloads.

### I.4: Ambient unit of work

- **Why**: threading a `tx` parameter through every port and repository makes a forgotten parameter a silent write outside the transaction. An ambient unit of work removes the parameter, so the transaction cannot be bypassed by omission.
- **Scope**: an `AsyncLocalStorage` scope carrying the transaction and collected events; nested `run` joins the open transaction (no savepoint), a failed `Result` at any depth rolls everything back and returns the same `Result`, events raised without an outbox roll back, a promise outliving its run reads the pool and never a closed transaction; repositories read `resolveExecutor()`; `mockUnitOfWork` with the same nesting rules. Migration is total and in batches (shared ports, then billing, consents, notifications and policies, then api-token, profile, quotas, rgpd and webhooks, then the BetterAuth bridge, then the remaining `db.transaction` sites), ending with `IUnitOfWork.run(work: () => Promise<T>)` and no `tx` anywhere.
- **Depends on**: I.1 (`mockPort`, event collection), I.2 (a layering test enforces the end state).
- **Done when**: a grep for `\btx\??:` and `ITransaction` over `modules/` and `shared/` returns nothing; `db.transaction(` appears only in `packages/drizzle` and `scripts/`; `check:uow-rollback`, `check:auth-transaction`, `check:wipe-rollback`, `check:enqueue`, `check:marksent`, `check:scim-seats` and `check:scim-connection` all pass against Postgres; every `db.transaction` removed has a recorded decision in its commit body.

### I.5: Outbox by lease with per-handler delivery

- **Why**: today the dispatcher holds `FOR UPDATE SKIP LOCKED` locks while the built-in subscribers run, and user handlers run after commit and are lost on a throw. A lease, handlers outside any transaction and per-handler tracking give at-least-once delivery without long locks.
- **Scope**: `dead_at` and `deliveries jsonb` columns with partial indexes (migration before code, the old dispatcher stays safe); named handlers (`subscribe(type, name, fn)`, `deliver` skips handlers already delivered); a claim by lease (`FOR UPDATE SKIP LOCKED` plus `UPDATE ... RETURNING`, SQL clock, settle guarded by `attempts` so a late settle writes nothing); a relay with bounded concurrency and a per-handler time budget, dead after 10 attempts then replayed every 6 h; listener reconnect with backoff and keepalive; audit, webhook fan-out and notification fan-out rewritten as idempotent named handlers; `emitEvent` without `tx` and a new internal `outbox.event_dead` event emitted once; retention that never purges undelivered dead rows.
- **Depends on**: I.4 (ambient enqueue, flush in the outer `run`).
- **Done when**: `check:outbox-lease` passes its scenarios (disjoint concurrent claims, lease expiry, stale settle writes nothing, `deliveries` merge, dead replay, rolled-back enqueue leaves no row, retention keeps dead rows) and runs in CI; `EXPLAIN ANALYZE` of the claim shows the partial indexes used; an end-to-end auth event shows `deliveries` naming the three built-in handlers with `attempts = 1`, and a handler made to throw leaves a partial `deliveries` and a `last_error` naming it; the catalog moves from 85 / 35 / 50 to 86 / 35 / 51 and `docs/EVENTS.md` describes lease delivery.

---

## Front redesign from scratch: **Phase J**

- **Status**: open.
- **Date**: after Phase I, before the review pass (the review reads the redesigned surface, not the one being replaced).
- **Why**: every screen still wears the shadcn defaults it was scaffolded with, so a clone looks like every other shadcn app until someone spends a week on it. The shell also carries measured defects: at 390 px and 768 px the top-nav header overflows the viewport by 33 px (the user menu is pushed off screen on `/settings`), and the theme provider renders an inline `<script>` that React reports as an error on every navigation.
- **Scope**: a design direction chosen once (typography, color tokens light and dark, radius, density, motion) and expressed only as tokens in the global theme of `@packages/ui`; shadcn/ui components reinstalled from the current registry and left unmodified where possible; every screen of `apps/app` rebuilt on them (auth, onboarding, dashboard, settings tabs, admin, legal, command palette, emails if their templates share the tokens). Built with the repo's frontend skills: `frontend-design` for the direction, `lean-ui` on every touched file, `polish-interface-details` and `animate-interface` for states and motion, `stress-test-ui` for empty, long and error data, `review-animations` before closing.
- **Out of scope**: new features, copy rewrites beyond what a layout change forces, a marketing site (E.2 stays cut).
- **Done when**: no screen overflows at 390, 768 and 1440 px (measured, not eyeballed); the browser console is clean on every route; the accessibility gate stays green with no new allowlist entry; no inline style and no color or spacing value outside the theme tokens (grep); `docs/SURFACE.md` parity test unchanged; screenshots of each screen in both themes attached to the PR.
- **References**: `packages/ui/CLAUDE.md`, `apps/app/CLAUDE.md`, `apps/app/a11y/README.md`.

---

## Review pass

- **Status**: open, not a code task.
- **Date**: after Phase J.
- **Why**: the shipped surface has been audited by phase and by tooling, never read end to end by its owner.
- **Scope**: full manual review of the shipped surface, owned by @axelhamil.
- **References**: [`docs/SURFACE.md`](docs/SURFACE.md), [`docs/FEATURES.md`](docs/FEATURES.md).

---

## Security perimeter remainder: **Phase C.1**

- **Status**: open, S1 to S5a shipped (see the table below).
- **Date**: when real traffic exists.
- **Why**: both items need real traffic to calibrate the false-positive rate (VPN and carrier NAT break geo heuristics; device fingerprints are bypassable).
- **Scope**:
  - **Behavioural signals (S5b)**: impossible travel on sign-in (`session.ipAddress` and `userAgent` are already stored), accounts-per-visitor cap, env-driven country and ASN deny-list. Each emits a `security.*` event.
  - **Captcha hook (S6)**: `ICaptchaService` port (Turnstile or hCaptcha free tier), invoked when `requireRateLimit` enters a near-cap state (above 80 % of the window), env-flagged.
- **References**: [Security perimeter C.1](docs/HISTORY.md#security-perimeter-rate-limit--csp--csrf--phase-c1--jun-2026).

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
| **C.1: Security perimeter (S1 to S5a)** | Jun to Jul 2026 | Abuse resistance by default | Fail-closed rate limit with IETF headers, strict CSP through Caddy nonce, Origin-based CSRF, per-account counter, disposable-email block, HIBP telemetry, 5 `security.*` events. S5b and S6 remain above | [HISTORY](docs/HISTORY.md#security-perimeter-rate-limit--csp--csrf--phase-c1--jun-2026) |
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

---

## Cross-cutting rules

1. **No DDD for these integrations**: `modules/<context>/infrastructure/services/*` on the api side, `features/<x>/hooks/*` and `shared/api/` on the app side. If a concept becomes domain (a `Subscription` with its own rules, say), promote it into `modules/<context>/domain/` then.
2. **Env validated by Zod** in `apps/api/src/shared/env.ts` (api side) and `apps/app/src/shared/env.ts` (app side).
3. **Webhooks** live in the owning module's `routes.ts` (`POST /webhooks/<provider>`), with signature verification before any processing.
4. **Secrets** are never committed: `.env.local` (gitignored), a secret manager in production.
