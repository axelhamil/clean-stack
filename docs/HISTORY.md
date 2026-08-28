# HISTORY

Shipped phases — full architectural log. The roadmap stays forward-looking; everything completed lives here.

Each section preserves the **why** and the **non-obvious decisions** baked into the codebase. New contributors read this to understand *why the code looks like it does*.

> **Note on paths**: file paths in entries below reflect the layout at the time of shipping. The codebase has since migrated to vertical-slice on both sides (front: `features/<x>/<x>.route.tsx` + `shared/`, code-based routing via `apps/app/src/router.tsx`; api: `modules/<context>/{application,infrastructure,routes.ts,module.ts}` + `shared/`, inwire `defineModule()` per context). For the current canonical layout see `CLAUDE.md` `## Layout`. The decisions and rationales below stay accurate — only the directory containers moved.

---

## Accessibility gate — axe in CI ✅ Phase A.6 · Aug 2026

**Why**: `/legal/accessibility` publishes a WCAG 2.1 AA conformance claim, and the EAA has been in force since 28 June 2025. A11y regressions ship invisibly — nobody files a bug, the complaint arrives through a different channel. A published claim with nothing enforcing it is the worst of both worlds.

**What this phase delivered**:

- **`apps/app/a11y/`** — Playwright as an axe driver, not an E2E suite. `pages.ts` lists 4 public + 3 authenticated pages, audited in **both colour schemes** (a `test.use({ colorScheme })` loop; `next-themes` defaults to `system`, so emulating the preference is enough). Adding a page is one array entry. `auth.setup.ts` produces the `storageState` the authenticated tests reuse.
- **`.github/workflows/ci.yml`** — the repo's **first PR-triggered CI**. Until this phase every gate (`ci:check`, `type-check`, `test`, `knip`, `jscpd`) ran only in the local pre-push hook, so a PR opened from anywhere else was never checked by a machine. The job stands up postgres, `bootstrap`s the env files, pushes the schema, seeds, starts the API, and runs `turbo run check:a11y --filter=app` (which builds first through `dependsOn`).
- **Blocking checks**: zero `serious`/`critical` WCAG 2.1 A/AA violations in light and dark; exactly one `<main>` and one `<h1>` per page; tab order across every `/sign-in` control; command-palette focus trap; reduced-motion skipping the theme view transition.

**Key decisions**:

- **Lighthouse dropped**, against the original spec. Its accessibility category runs a subset of axe-core, so an `a11y = 100` budget restates what a zero-violation axe run already proves — at the cost of ~2 min of CI and one more flake source. Perf/SEO budgets remain a separate, unmade decision.
- **`audit()` asserts the final URL.** A gate redirect (no session, stale policies) renders a page with a `<main>`, an `<h1>` and no violations — it passes every other assertion. This was not hypothetical: the authenticated tests were green while auditing `/legal/accept` three times, because the seeded account had never accepted the policies. Without a URL assertion the whole authenticated half of the suite is theatre.
- **One sign-in per run, by construction.** `/sign-in` allows 5 attempts per 15 min per IP, and `RateLimiterFlexibleAdapter` sets `inMemoryBlockDuration`, so the block lives in the API process — clearing the `rate_limit` table does not lift it. Two sign-ins per run means three consecutive local runs lock the developer out. The setup therefore signs in *with the keyboard* (covering WCAG 2.1.1 operability) and the interaction spec asserts tab order without submitting.
- **Reduced motion is observed, not inferred.** `theme-transitioning` is added and removed within one transition, so polling for it is a race. An `addInitScript` `MutationObserver` records whether the class ever appeared; the assertion is on that record.
- **`a11y/` excluded from vitest.** Its default glob collects `*.spec.ts`, and a Playwright `test.describe()` outside the Playwright runner throws. It also carries its own `tsconfig.json` (`types: ["node"]` over the react base) and a second `tsc` invocation in `type-check` — the app's `include` is `src/**` only, so the specs would otherwise never be type-checked.

**Seven real defects**:

1. **Every password field in the app had no accessible label** (`label`, critical). `FormTextField` wrapped `<FormControl>` around the `<div class="relative">` holding the input *and* the reveal button. `FormControl` is a Slot: it forwards the generated `id` to its single child, so `<label for>` pointed at the div. Fixed by wrapping the `<Input>` itself.
2. **`/sign-in` and `/sign-up` had no `<h1>`.** `AuthShell` passes its title to `CardTitle`, which renders a `<div>`. `CardTitle` now accepts `asChild` (the shadcn Slot pattern already used by `Button` and `NavLink`), so the visible title *is* the heading — rather than bolting on an `sr-only` duplicate the way pages with no visible title do.
3. **`--accent-foreground` on `--accent` measured 4.27:1** in light (active nav pill). L 0.5445 → 0.52 (4.75:1). Dark measured 7.5:1, untouched.
4. **`--destructive` measured 3.85:1** both as text on a card and behind white on a button, and the destructive `Alert` compounded it with `/90` opacity on the description → 3.36:1. The opacity is gone (no red dark enough to absorb ~0.9 of ratio stays readable) and the token went L 0.629 → 0.58 (4.72:1).
5. **The avatar `input[type=file]`** was `sr-only`, `tabIndex={-1}` and unlabelled. Given an `aria-label`.
6. **Dark only — `--primary` measured 4.12:1** under white, i.e. every default button in the app. L 0.6132 → 0.58 (4.75:1). Light was already 5.82:1.
7. **Dark only — the impersonation banner measured 2.76:1.** `Alert variant="banner"` used `bg-destructive` at full opacity; `Button` and `Badge` had long carried `dark:bg-destructive/60` for exactly this reason, and the banner now does too.

**Why the arithmetic was not enough.** The first pass computed contrast by hand (oklch → linear sRGB → relative luminance) and concluded the opposite of the truth: that every destructive button was broken in dark, and that `--primary` was fine. Tailwind mixes opacity in **oklab**, so `bg-destructive/60` lands far darker than a linear-sRGB blend predicts. Hand calculation is useful to *propose* a candidate L; only axe against the rendered page decides. Every number above is a measurement.

**A defect the gate cannot guard.** The impersonation banner only renders inside an impersonated session, so no audited page contains it. It was measured by injecting the markup into a live page and running axe on that node — enough to find and fix it, not enough to keep it fixed. Same blind spot for any surface behind a specific session state.

**Two clone-blocking `db:seed` bugs**, surfaced by needing a real account to audit authenticated pages — `pnpm --filter api db:seed` failed on a fresh clone:

- `dev@clean-stack.test` is rejected by the S5a disposable-email guard: `.test` is IANA-reserved and can never carry an MX record, which `DisposableEmailService` reads as throwaway. Default now `dev@example.com`.
- The default password `DevSeed!2026-clean` contains the email local part (`dev`), which `findPasswordViolation` rejects. Default now `Nimbus-Harbor-42-Quartz`.
- The script also now records the initial policy acceptance. Forcing `emailVerified` in SQL bypasses the `/verify-email` hook that normally writes it, so every seeded account landed on `/legal/accept` at first sign-in.

**Deliberately not covered**: Lighthouse perf/SEO budgets, and screen-reader behaviour (no automated tool covers it).

---

## In-app notification center ✅ Phase D.3 · Aug 2026

**Why**: transactional email is asynchronous and users miss it. An in-app inbox is the SaaS default (Linear, GitHub, Stripe) and is the last piece F.1 (Capacitor) depends on. The interesting part is not the inbox — it is that the event backbone already resolves *what happened*; notifications only add *who should hear about it*.

**Why a typed catalog projection over a workflow DSL**: Knock / Novu / Courier all ship a workflow engine because they do not own the emitting system. Here the outbox already resolves fan-out, so the entire "engine" collapses into `Partial<Record<EventType, NotificationConfig>>` — the third projection of the catalog after `visibility-map` (webhooks) and `retention-map` (purge). 21 of 67 events are notifiable; the rest stay audit-only by default.

**What this phase delivered**:

- **Audience by capability, never by role tuple** — `"self" | "actor" | "org:all" | { can: OrgPermissions }`. `audience: "org:admins"` is exactly the hardcoded tuple org-scoping rule §6 forbids. Costs nothing at runtime: roles are static, so `ORG_ROLES.filter(authorizeRole)` resolves at boot into `WHERE member.role = ANY($1)`. **Trap**: `billing:["manage"]` is owner-only — a notification asks *who needs to know*, not *who may act*, so `read` is nearly always the right level.
- **Fan-out inside the dispatch TX** (`NotificationFanoutSubscriber implements OutboxSubscriber`), beside audit and webhook fan-out — not the `onEvent` post-commit handler the design first suggested. `onEvent` is best-effort and isolated, so a lost notification fails silently.
- **Preference cascade resolved in the insert statement**: `org locked > user > org default > enabled`, one `LEFT JOIN notification_preference` per scope per channel on a single `INSERT ... SELECT`. In-app decides the `WHERE`; email decides a `CASE` filling `emailPendingAt`. `forced: true` short-circuits all four and emits no joins.
- **SSE carries a signal, never data** — `pg_notify('notification_created', user_id)` + one `LISTEN` connection per instance (never per client, which exhausts the pool at a few hundred users). The client's only reaction is `invalidateQueries`, which makes reconnection self-healing and deletes `Last-Event-ID`, replay and merge logic outright. Client uses `fetch` + `ReadableStream`, **not `EventSource`** — it cannot carry an `Authorization` header, which would break F.1's bearer.
- **Throttling by partial unique index** `(userId, dedupKey) WHERE dedup_key IS NOT NULL`, window baked into the key. Dedup at insert inside the TX is concurrency-correct; a counter would need a lock for the same guarantee.
- **Front** — bell + inbox in the shell, `/settings/notifications` matrix, org defaults card in `/settings/organization` (a route under `orgScopeLayout` would collide, it flattens children under `settings/`). Cross-tab read propagation over `BroadcastChannel`, applied to the cache without refetching. Polling only as fallback, with `refetchIntervalInBackground: false` so a forgotten tab whose stream died stops asking.
- **No new event type.** Notification creation emits nothing — it would loop with its own subscriber. Only the two preference *mutations* emit (`notification.preference.updated`, `notification.org_preference.updated`). Catalog stays **67 / 28 public / 39 internal**.

**Structural decisions**:

1. **The preference cascade shipped inert, and was found only when building the UI on top of it.** The fan-out never read the preference table, `forced` was read nowhere, and `NotificationPreferenceService.resolve` was registered in inwire with zero callers — the backend phase had been marked complete with a green suite. The settings page would have written rows that changed nothing, while telling users security alerts could not be disabled (nothing was ever disabled). Branched into the insert statement, and the dead service deleted: **two implementations of one cascade, only one of them wired, diverge by construction** — and this one already had, since `resolve()` ignored unlocked org rows.
2. **`org default` is a fourth cascade level, added deliberately.** An unlocked org row now applies when the member expressed no choice. Without it, the "organization defaults" card would set values that never take effect — a default that never defaults.
3. **`forcedLevelOf` returns `all | some | none`, not a boolean** — `security` is fully forced, `billing` only partly (payment failed and cancellation are, subscription created is not). A boolean would have to lie about billing. The UI disables a fully-forced row *with its reason* rather than hiding the switch: a hidden option is one the user hunts for forever.
4. **SQL logic cannot be covered by this repo's unit tests, and pretending otherwise is the real risk.** A mocked `tx` evaluates no `WHERE`; there is no DB integration harness. Verification lives in `apps/api/scripts/check-fanout-preferences.ts` (`pnpm --filter api check:fanout`, 8 cases against Postgres) — re-run it after touching the fan-out. Two tests asserting on generated SQL text were written and removed: they depend on the real `sql`, which another file's `mock.module` replaces process-wide, so they passed or failed on execution order. That script is also what caught `CASE WHEN … THEN $date` breaking Postgres type inference (cast `::timestamp` required).
5. **Everything cross-cutting lives in `apps/app/src/shared/notifications/`, not in the feature.** `shared/` may not import `features/` (the bell mounts in `app-shell`), and two route-owning features may not import each other (the matrix serves both `features/notifications` and `features/organization`). The import the feature layout would need does not exist. Promoted to a placement decisor in `apps/app/CLAUDE.md`.
6. **Row labels reuse `EVENT_DESCRIPTIONS`** rather than restating 21 strings in the front. Payloads carry ids, not names, so there is no human detail to render beyond the sentence the catalog already owns.

**Out of scope** (explicit):
- Native push (mobile / browser) — Phase F, needs a device-token registry.
- Frequency-driven digest windows: the column and the UI exist, the flush cron still treats every pending row the same. Honouring `hourly` / `daily` is a cron change, not a schema change.
- Generalized real-time bus. The stream is notification-shaped on purpose; a generic bus is a different product.

---

## API tokens / Personal Access Tokens ✅ Phase C.4 · Aug 2026

**Why**: any B2B SaaS needs a machine-to-machine auth primitive that can't be session-stolen. Session cookies work for browsers; PATs work for CI, CLI, and customer integrations. Without them, customers resort to screen-scraping or long-lived session abuse — both unauditable. PATs also unblock C.4's opt-in public API surface, which is the prerequisite for D.2 (OpenAPI docs) and F.1 (Capacitor bearer).

**Why hand-rolled over `@better-auth/api-key`**: the plugin covers table + SHA-256 + expiry + CRUD but has no lifecycle hooks — rule §6 requires the event to commit in the same TX as the write. Wrapping every endpoint to add event emission would leave only a table with 8 dead columns. `ScopedRepository<ApiToken, RepoScope>` + `emitEvent` in-TX cost fewer LOC than the wrapper, and gives native §8 instrumentation. Scopes format and column names borrowed from the plugin.

**What this phase delivered**:

- **Token format** — `clean_` prefix (configurable via `API_TOKEN_PREFIX`) + 32 bytes CSPRNG as 44-char base58 + 6-char CRC32 checksum. The prefix makes tokens greppable in logs; the checksum rejects typos/truncations before the DB hit and sharpens the GitHub secret-scanner regex.
- **Storage** — `HMAC-SHA256(pepper, token)` in a unique-indexed `token_hmac` column. No per-row salt — a 256-bit HMAC key makes rainbow tables inconceivable, and per-row salt destroys the O(1) lookup. The pepper (`API_TOKEN_PEPPER`) is the SOC2 argument: a DB dump alone yields no usable token. `pepper_version` column enables zero-downtime rotation via `API_TOKEN_PEPPER_PREVIOUS`.
- **Schema** — `api_token(id, userId, organizationId, name, tokenHmac, pepperVersion, tokenStart, scopes, lastUsedAt, expiresAt, createdAt, revokedAt, revokedReason)`. `userId` = creator + owner. `ScopedRepository<ApiToken, RepoScope>` — wrong-owner returns `Option.none()` / `NOT_FOUND`, never 403.
- **Scopes** — typed const `API_SCOPES = ["read:profile", "write:profile", "read:organizations"]`. Per-token subset. No global `*`. No `admin` scope — platform-admin surface is token-unreachable by construction (token management lives outside `/api/v1`; a token cannot mint a token).
- **`requireApiToken` middleware** — accepts `Authorization: Bearer clean_<…>`, verifies checksum, HMACs both peppers, sets `c.var.user` + `c.var.tokenScopes`. `lastUsedAt` updated via time-bucket write (`WHERE last_used_at < now() - interval '15 min'`) to avoid hot-row contention.
- **`/api/v1` sub-app** — mounted in `index.ts` outside the `const routes = ...` chain, deliberately outside `AppType`. Token-auth only; no `sessionMiddleware`. Dual rate-limit: per-token (detect compromised-key abuse) + per-IP (detect distributed rotation). See `apps/api/CLAUDE.md` for the AppType exception note.
- **`/settings/tokens` CRUD** — create (name + scope picker + optional expiry, token shown once in `<SecretRevealDialog>`), list (last-used timestamps), revoke. `denyImpersonated` on create + revoke — the admin blocklist grows from 11 to 13 routes.
- **Cascade revocation** — `onEvent(ORG_MEMBER_REMOVED)` handler revokes all org-scoped tokens for the departed member in a single pass. Emits one `api_token.revoked` per token.
- **`POST /api/token-scanning/github`** — ECDSA P-256 signature verification (`GITHUB-PUBLIC-KEY-SIGNATURE` + `GITHUB-PUBLIC-KEY-IDENTIFIER` against `api.github.com/meta/public_keys/secret_scanning`). Matching tokens are revoked + owner notified by email.
- **Event catalog 62 → 65** — three new events: `api_token.created` (public), `api_token.revoked` (public), `api_token.used` (internal — sampled, high-volume). `visibility-map.ts` introduced as the explicit public/internal allowlist (28 public, 37 internal). Publishing an event is now a deliberate PR-reviewed decision, not the default.

**Structural decisions**:

1. **`/api/v1` outside `AppType`** — chaining it into `routes` would impose `AuthVariables` on routes that carry `ApiTokenVariables`, and expose every public-API route to `hcWithType` which the internal RPC client never needs. The boundary is structural, not config — a route under `/api/v1` is unreachable by session auth.
2. **`api_token.used` is internal** — sampled at ~1 event per 15-min bucket per token. Making it public would create a contract on a high-volume, lossy signal: customers could never build a reliable audit trail from it anyway, and subscribing would flood their endpoints. `audit_log` is the reliable trail.
3. **All `webhook.*` events reclassified to internal during C.5 curation** — `webhook.endpoint.created/updated/deleted` are operational plumbing, not customer-observable state. This means the subscription picker and `/developers/events` show no "webhook" group. Test `webhooks-schema.test.ts` documents this decision assertively.
4. **`visibility-map.ts` as the gate, not a naming convention** — a `webhook.` prefix doesn't make an event internal; only an explicit `"internal"` entry in the map does. New events default to nothing — they must be added to the map (TypeScript `satisfies Record<EventType, Visibility>` enforces this).

**Out of scope** (explicit):
- OAuth app flow (next natural step after PATs, requires a separate spec).
- `read:uploads` scope — the uploads module has no listing route and storage is opt-in; the scope would guard a route that can't exist without out-of-scope work.
- GitHub Secret Scanning Partner Program registration — requires a public service; each clone registers independently. The boilerplate ships the verifier + endpoint + prefix convention so registration is a 30-minute job.

---

## Option / Result convention back-fill ✅ Aug 2026

**Why**: an audit of ports, services and the HTTP boundary found `Result` respected everywhere and `Option` respected only in recently-written code. The convention had been applied going forward and never back-applied, so `modules/webhooks` — the module the codebase treats as the reference — was inconsistent with itself: `WebhookDeliveryRecord` used `Option<T>` directly above two record types using raw `| null`.

**How it was found**: not by review. The same defect had just shipped in the D.5 email queue (`Date | null` in a port whose sibling used `Option`) and survived three separate code reviews, each of which had the rule quoted verbatim in its prompt. Reviewers verify what they are asked to trace concretely — index mapping, claim concurrency, attempt accounting — and skip what is stated as a general principle. The lesson, now applied when auditing a cross-cutting convention: give the reviewer the conformant sibling file and ask for a field-by-field comparison.

**Decisions**:

1. **`Result.ok` overloaded.** `static ok<T, E>(value?: T)` made the value optional for *every* `T`, so `Result.ok<string>()` compiled and `getValue()` returned `undefined` typed `string` — with a `biome-ignore` comment claiming the non-null assertion was safe after the `isSuccess` check. It was not: the result is a success whose value is absent. Two overloads (`(): Result<void, E>` and `(value: T): Result<T, E>`) close it. The hole was genuinely exploited — 18 test mocks called `Result.ok<void, E>()` with no argument.
2. **`null` stops at the store.** Ports express absence as `Option<T>`; the repository converts with `Option.fromNullable` on read and unwraps on write; routes unwrap back to `null` only when serialising, so no wire format changed.
3. **Three residuals kept deliberately**: `OutboxEnqueueScope.organizationId` (input DTO whose callers hold raw nullables from BetterAuth), `AuditFilters.organizationId` (three-state SQL filter — `undefined` don't-filter / `null` `IS NULL` / value equality; `Option` cannot express it), and `AuditEventSubscriber` writing `audit_log` directly rather than through `IAuditPort` (infra subscriber, parallel write path by design).
4. **The audit hash chain was never at risk** — `audit-hash.ts` was not modified, so the hashed bytes are identical on existing production rows and `GET /admin/audit-log/verify` still validates them.

**Scope**: `@packages/ddd-kit` (the overloads), then consents, billing, the rate-limiter adapter, webhooks, and the shared outbox + audit ports. An adversarial closure re-audit confirmed no unguarded `unwrap`, no dropped `isFailure` check and no paper-over cast.

**Trap for later**: converting a record type to `Option` tempts the implementer to satisfy the type-checker with `arr[0]!` in tests. Three such assertions were introduced and reported back as "pre-existing" — they were not. Destructure and guard instead.

---

## Auth — BetterAuth (end-to-end) ✅ Phase 1 · Phase 2 (organization)

**Why**: own the token, multi-provider, typed plugins (Stripe, organizations, 2FA, passkeys, magic-link), DB-backed sessions, first lib that runs natively on Bun + Hono with no hacks.

Plugins shipped: `twoFactor`, `passkey`, `magicLink`, `bearer` (Capacitor-ready). `organization` shipped in Phase 2; `stripe` deferred.

- **Performance**: `session.cookieCache` (5 min) on the server — auth check is signature-only between refreshes (no DB hit). DB stays source of truth at expiry → instant revoke on sign-out/ban.
- **Native readiness**: `bearer()` plugin enables `Authorization: Bearer <token>` alongside cookies. Web stays cookie-based (httpOnly, XSS-safe), Capacitor/mobile uses bearer with secure storage. Same session row, transport differs.
- **Email URLs route through the app, not the API** — every email link points to `${APP_URL}/<route>?token=...`. The frontend page consumes the token via the typed client. No more `callbackURL` mangling by Outlook & co.
- **Session as TanStack Query, not React state** — `sessionQueryOptions` (staleTime 5 min aligned with `cookieCache`). Router context only exposes `queryClient`; gates do `await context.queryClient.ensureQueryData(sessionQueryOptions)` in `beforeLoad`. No `useSession()` React bridge, zero race between nanostores and beforeLoad.
- **Realtime cross-tab session sync** — native `BroadcastChannel('clean-stack-auth')` (~15 LoC, no experimental dep). Auth mutations call `broadcastAuthChange()` after refetching the session query; `app-providers.tsx` listens once and on receive does `refetchQueries(['session']) + router.invalidate()`. Tab A signs out → tab B instantly transitions to `/sign-in` without polling or hard reload.
- **Strong password schema split** — `passwordSchema` (loose: `min(1)`, used by sign-in to capture; server validates) and `strongPasswordSchema` (strict: `min(12).max(128)` + lowercase/uppercase/digit, used by sign-up + reset). NIST-aligned: no required special character.
- **StrictMode-safe token consumption** — `useRef(false)` guard in verify-email and magic-link pages prevents the dev-only double-fire of single-use tokens.
- **Pathless layouts** — `_protected.tsx` (block when no session) and `_guest.tsx` (block when already logged in) — single `beforeLoad` shared by all children, URLs unchanged.

---

## Multi-tenant — BetterAuth `organization` plugin ✅ Phase 2

**Why from day one**: migrating single-user → multi-tenant after the fact is hell (backfill `organizationId` everywhere, orphaned owners, rewrite every query). The reverse is free: if it ends up B2C, every user gets an invisible auto-created "personal org".

- Auto-create a personal org on signup (`databaseHooks.user.create.after`, slug `personal-${orgId}` — UUID v4, never user-visible).
- Session enriched with `activeOrganizationId` → Hono middleware pushes it into `c.var.orgId`.
- **Every business table** has an `organizationId` FK from the very first migration (never added later).
- **Slug auto-generated, never user-input** — create-org form only asks for `name`; mutation generates `org-${crypto.randomUUID()}`. Slug is a DB uniqueness constraint, not a UX surface.
- **Stripe customer = per organization, not per user** (the Stripe plugin supports it natively — wired in Phase 3).

### Capability-based authorization layer (post-merge hardening)

The plugin ships built-in role checks for plugin endpoints, but business routes + UI need the same predicate without re-implementing it. Solution: `@packages/access-control` — wraps `createAccessControl` with extended `STATEMENTS`, exports `ac`, `roles`, `authorizeRole(role, permissions, connector?)` predicate. The `as unknown as AccessControl` cast required by BetterAuth's generic plugin signature is hidden inside the package — call sites stay strict-typed.

**Three layers, one contract**: server `requireOrgPermission(permissions)` middleware; front route gate `ensureOrgPermission(permissions)` in `beforeLoad`; UI gate `<Can requires={...}>` backed by `useAuthorization()`. Same predicate everywhere; renaming an action requires touching the package only.

- **Capability-based, never role-based, in feature code** — describe `{ organization: ["update"] }`, not `["owner", "admin"]`. Children call `useAuthorization` themselves rather than receiving boolean `canEdit` props.
- **Flat `_org-scope` route layout** — one pathless gate ensures active-org-required; capabilities live per-route via `beforeLoad: ensureOrgPermission({...})`. Avoids stacking `_org-admin` / `_org-owner` / `_can-manage-billing` pathless tiers as new resources land.
- **Navigation declares `requires: OrgPermissions`** — `SETTINGS_TABS` and `NAVIGATION_ROUTES` filter via `useAuthorization().can(requires)`. The visible tab set matches what the gate accepts; no drift between "I see the tab" and "the gate lets me in".
- **`AuthorizationDevTool`** — dev-only floating panel (tree-shaken via `import.meta.env.DEV`) visualising the active session's role and the full capability matrix derived from `STATEMENTS` × `roles`.

### Lifecycle hooks — self-heal + auto-cleanup

Personal org is structurally identical to a team org for every operation except delete/leave. The lifecycle exception is encoded in `isPersonalOrg(slug)` + the hooks below.

- **`ensurePersonalOrgFor(userId)`** — idempotent self-heal in `auth.ts`. Runs in `databaseHooks.user.create.after` (signup) AND `databaseHooks.session.create.before` (sign-in — back-fills legacy users with `activeOrganizationId: null`). Never duplicate the create-personal-org logic inline.
- **`afterRemoveMember`** — non-Personal orgs auto-collapse when the last member leaves. Skipped for Personal orgs (user must delete their account). Empty orgs = zombies; auto-cleanup keeps it truthful.
- **`beforeDeleteOrganization`** — rejects Personal org deletion outright. The front mirrors this by hiding the Leave button on Personal and rendering a hint on Delete.
- **Owner-leave flow** — sole member → org auto-deletes; sole owner with other members → must transfer first. `transferAndLeaveMutationOptions` is the multi-step factory: `updateMemberRole` then `leave`. Post-leave both flows call `switchToFirstRemainingOrg(queryClient)` + `broadcastAuthChange()`.
- **`NO_ACTIVE_ORGANIZATION` translated to `null`** — `currentMembershipQueryOptions` and `activeOrgQueryOptions` catch BetterAuth's error code and return `null`. "No active org" is a valid transient state; letting it bubble crashes consumers.
- **`broadcastAuthChange()` extended to org events** — `setActive`, `create-org`, `delete-org`, `leave-org`, `transfer-and-leave`, `accept-invitation`, `remove-member` all call the broadcast. Cross-tab consistency under the 5-min `cookieCache.maxAge` window.

### May 2026 cleanup — dropped the `teams` sub-plugin

**Removed the BetterAuth `teams` sub-plugin.** Grouping-only (no team-scoped roles or statements) added UX surface for ~zero value at this stage. Re-enables in two lines if a clear use-case emerges. Settings collapsed from a General/Members/Teams split to a single Organization tab with section-level `<Can>` gates per role.

---

## Email — Resend (dashboard templates) ✅ Phase 1

**Why**: templates managed from the Resend dashboard (no code, no rebuild to change wording), built-in versioning, native A/B test.

- **Type-safe variables per template** — `EmailTemplates` maps each template name to its required variables. Renaming a variable in the dashboard without updating code = TS red, no silent break.
- **`Result<void, EmailError>`** — `sendTemplate` never throws, returns a discriminated `EmailError` (`EMAIL_TRANSPORT_NOT_CONFIGURED` | `EMAIL_PROVIDER_FAILURE`). Integration adapters (`auth.ts`) translate to `throw` only at the BetterAuth-hook frontier.
- **Retry with exponential backoff** — 3 attempts (1s/2s/4s), retry only on `429` and `5xx` + network errors (`status === 0`). 4xx non-rate-limit fail fast (validation = retry futile). Distinct `STATUS_HINTS` log per `401` / `403` / `409` / `422` so prod debug isn't blind.
- **`Idempotency-Key`** — `${event-type}/${sha256(token)[:32]}` (Resend pattern, 24h window). Hash via `Bun.CryptoHasher`. Safe under retries — same payload returns original response, different payload returns 409.
- **`SendTemplateOptions.from?`** — per-tenant `from` override slot for future per-org sending domain. Defaults to `env.RESEND_FROM`. Adding it now = zero breaking change in phase 2.
- **`SendTemplateOptions.locale?`** — slot reserved for the i18n phase. Adapter logs a warn ("not yet implemented") if passed; resolution will switch to `${template}_${locale}` env lookup when locale-prefixed templates land.
- **Boot-time fail-hard in production** — constructor throws if `NODE_ENV === "production"` and `RESEND_API_KEY` or any template ID is missing. Dev mode keeps the warn-only fallback. *Note: reversed by prod-validation closeout (Phase 0.7) to warn-and-degrade for the boilerplate — see that entry.*
- **IP reputation guarded by Resend, not by us** — Resend ships a domain-scoped suppression list since 2025: hard bounces and spam complaints auto-add the address. **No own suppression table needed** until a product feature actually consumes it. Building it earlier is the OpenUp anti-pattern. Promote on second occurrence.
- **DNS mandatory before any production send** — Gmail (Feb 2024), Yahoo (Feb 2024), Microsoft Outlook (May 2025) all reject unauthenticated bulk senders with 550 5.7.515. SPF + DKIM CNAMEs + DMARC TXT (`p=none` → `p=quarantine` once stable, target `p=reject`).

---

## Storage — Cloudflare R2 (prod) + SeaweedFS (dev, opt-in) ✅ Phase 1

**Why**: R2 = no egress fees, S3-compatible, SigV4 only. SeaweedFS local = same S3 API → one codebase, switched via env. **R2 drives the design** (SeaweedFS is for dev convenience, not a target). Originally MinIO; swapped to SeaweedFS in May 2026 after MinIO was archived (April 25, 2026, features moved behind enterprise license).

**R2 quirks that shape the design (verified 2026)**: R2 does **not** support Presigned POST policies — only PUT/GET/HEAD/DELETE. There is **no native `content-length-range`** condition. `ContentLength` and `ContentType` passed to a presigned PUT are *signed* (the client must send those exact headers or 403 `SignatureDoesNotMatch`), but R2 does not verify the actual body size against them. Real enforcement requires a **post-upload `HeadObject` + `DeleteObject` on mismatch** step, which is what the `confirm` route does. Object Lock and Bucket Policies are not implemented on R2; do not depend on them.

**Three-step flow**: `presign` → client `PUT` direct to R2 → `confirm` (server `HeadObject`, deletes on size/content-type mismatch).

- **Pure transport port** (`IStorageService`) — `presignUpload` / `presignDownload` / `headObject` / `deleteObject` / `publicUrlFor`. Zero business rules; the adapter just signs S3 requests and forwards SDK calls.
- **S3 adapter** — `S3Client` with `region: "auto"` (R2's only accepted value), `forcePathStyle` (kept on for SeaweedFS compat — harmless on R2). Boot-time fail-hard in production if `S3_ENDPOINT` is localhost or creds are dev defaults. Presigned PUT signs `content-type` + `content-length` headers (`signableHeaders`) so the client can't drop them.
- **Owner-scoping enforced in use-cases**: every key is `<userId>/<scope>/<uuid>-<filename>`; download + confirm reject any key whose prefix is not `<requestingUserId>/` (`STORAGE_FORBIDDEN`). `confirm-upload` performs `HeadObject`, deletes on size/content-type mismatch, returns `STORAGE_INTEGRITY_FAILED`.
- **Validation lives at the controller boundary** — Zod schemas enforce filename regex (`^[\w\-. ]+$`), scope regex (`^[a-z][a-z0-9-]{0,31}$`), max size (`STORAGE_MAX_UPLOAD_BYTES`, default 50 MB). Zod failures return 400.
- **R2 region is permanent**: once chosen (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com` or `…eu.r2.cloudflarestorage.com` for EU jurisdiction), R2 cannot move the bucket.
- **Flat DI container** — inwire infers everything. Use-cases registered next to their infra ports, type-checked by inference (reorder a `.add()` to put a use-case before its port → `tsc` rouge). Promote a section to `modules/<context>.module.ts` only when a bounded context grows large enough to bloat `container.ts`.
- **`createUploadMutationOptions`** — TanStack Query mutation factory chaining `presign` → `PUT` direct to R2 (with explicit `Content-Length`) → `confirm`. Returns `{ key, publicUrl, size, contentType }` only after server-verified integrity.

> Dev: opt-in via `docker compose --profile storage up -d`. SeaweedFS has no auth by default (any creds accepted). No web console.

---

## RGPD / CCPA — data deletion (Art. 17) + export (Art. 20) ✅ Phase 1

**Why**: clean-stack is a boilerplate cloned to start any SaaS. A clone deployed to EU users without Art. 17 + Art. 20 is illegal day one — fines up to 4% of revenue. The cascade was built **before** Billing / Audit-log / Admin landed so every future feature inherits the deletion contract rather than retrofitting it.

- **Export endpoint** `POST /me/export` — sync (walks user's tables in-request, uploads JSON bundle to R2, emails a signed 7-day URL via Resend). Rate-limited 1/24h. The presigned URL is **never** put in an event payload — events carry only `storageKey` (security).
- **Pre-flight ownership gate** `GET /me/delete/preflight` — returns the sole-owner non-personal orgs that block deletion. UI renders the blocking list; the `Delete account` button stays disabled while non-empty. **Auto-transfer rejected on principle** — no implicit refiling of legal/billing responsibility onto a member without consent.
- **Delete endpoint** `POST /me/delete` — auth + **2FA-required** + server-side preflight re-check (409 `ACCOUNT_DELETION_BLOCKED` if a sole-owner org appeared between read and submit) + **7-day soft-delete grace**. Cron sweeps expired requests, wipes personal data and anonymizes `member` rows (`userId → null`, `email → deleted-<uuid>@anonymized.local`).
- **Cancel-deletion UX** — signing in during the grace window prompts a cancel/continue dialog.
- **Soft-delete confined to RGPD** — `user.deletedAt` + `user.pendingDeletionUntil` are the **only** soft-delete columns in the codebase (no creep elsewhere; everything else is hard-delete).

**Decisions (non-obvious, locked-in by code)**:

1. **Soft-delete grace, not immediate wipe** — Art. 17 allows a reasonable processing window. The 7-day grace doubles as a self-service "I changed my mind" path and a safety net against account-takeover-then-delete attacks.
2. **Anonymize `member`, don't cascade-delete it** — deleting the `member` row would corrupt org audit trails ("who invited whom"). Setting `userId → null` + a tombstone email keeps referential history intact while removing the PII link.
3. **Sole-owner preflight is server-authoritative, re-checked at submit** — the UI gate is UX; `POST /me/delete` handler re-runs the preflight so a race (org ownership changing between page-load and click) can't orphan an org.
4. **2FA gate on a destructive irreversible action** — reuses BetterAuth `twoFactor` challenge, consistent with "step-up auth on irreversible ops" posture.

**Remaining** (tracked in dependent phases): E2E deletion-cascade gate (A.6), admin export-on-behalf + deletion overrides (C.3), Stripe customer cleanup during wipe (B.1).

---

## App shell — top-nav + ⌘K command palette ✅

**Why**: sidebar SaaS shells are the 2010-2024 standard, but the SOTA 2026 wave (Vercel, Linear, Resend, Trigger.dev) consolidated on top-nav + global ⌘K palette. Less chrome, better mobile, keyboard-first power-users.

Top-nav header (sticky, blurred bg); contextual sub-nav (second header line, appears only on `/settings/*`); global ⌘K palette with Navigate, Switch organization, and Actions groups; org switcher as `Command`-powered popover. `/settings` hub with six sub-pages; `/settings` index redirects to `/settings/general`.

**Custom inline-SVG `LogoMark`** — two offset rounded squares (front solid, back at 18% opacity), theme-aware via `currentColor` + `var(--background)`. No asset file.

---

## Event-driven foundation — outbox + dispatcher + audit-log + webhooks ✅ May 2026

**Why**: every cloned SaaS needs the same event plumbing — outbox for at-least-once delivery, audit log for compliance (SOC2 §CC7.2 + ISO 27001), outbound webhooks for customer integrations, in-process handlers for side-effects. Building that rail once-for-all unlocks Phases A.4 (consent handlers), C.2 (audit), C.5 (webhooks), C.7 (SSO audit), D.3 (in-app notifs), 0.4 (observability subscribers) — each becomes a 1-line `onEvent(...)` declaration instead of a per-feature plumbing chunk.

**DX contract — zero plumbing post-clone**: a dev writes (1) a 1-line entry in `packages/events/src/event-types.ts`, (2) `aggregate.addEvent(new XEvent(...))` in their domain method, (3) `this.uow.run(async tx => repo.save(agg, tx))` in their use-case. The outbox enqueue happens transparently via `AsyncLocalStorage` event collector + `IUnitOfWork.run()` flush pre-commit. Audit + webhook fan-out automatic if the event is in the retention map. In-process handlers via `onEvent(type, factory)` + 1 inwire `b.add(...)` auto-discovered at boot. See [`docs/EVENTS.md`](EVENTS.md) for the full DX guide.

### Catalog `@packages/events`

29 events at foundation (grown to **35** as later phases added webhook-endpoint ×3, profile-updated + email-change-requested ×2, policy-accepted ×1) covering BetterAuth (user/session/account, organization/member/invitation, MFA/passkey), RGPD, uploads. Zod payload schemas — typed discriminated union via `PayloadByEventType`. `RETENTION_MAP` — per-event `operational` (90d) / `compliance` (7y) / `none`.

### `@packages/ddd-kit` extensions

- **`Aggregate.pullDomainEvents()`** — atomic pull-and-clear.
- **`EventCollector`** (AsyncLocalStorage) — per-uow context isolation. Verified via concurrent `Promise.all` test.
- **`IUnitOfWork.run(cb)`** standardized — wraps Drizzle `db.transaction(...)` + opens ALS context, drains events pre-COMMIT via injected `flushHandler`. **Nested `run()` forbidden** — impl throws `Error("nested IUnitOfWork.run() is not supported")` because Drizzle nested transactions are independent (not savepoints) → events would orphan.
- **`onEvent(type, factory)`** + `EVENT_HANDLER_SYMBOL` (cross-realm via `Symbol.for("clean-stack/event-handler")`).
- **UUID v7 inline impl** (RFC 9562, no external dep) — replaces v4 in `UUID.create()`. Time-ordered → B-tree locality on insert.

### Shared infra

- **`OutboxDispatcher`** — in-process Bun worker. Dedicated `pg.Client` for `LISTEN outbox_event` + reconnect with exponential backoff + 30s poll fallback. `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 50` drain (multi-instance ready). Built-in subscribers (audit + webhook fanout) run inside the dispatch TX (atomic with `markDispatched`); user `onEvent(...)` handlers run **post-commit** in a separate loop (best-effort, isolated). `pg_notify` trigger ensured idempotently at boot. Container introspection auto-wires user handlers via `Object.entries(di)` + `EVENT_HANDLER_SYMBOL` filter.
- **Built-in subscribers** — `AuditEventSubscriber` writes audit rows idempotently via deterministic ID `audit-${event.id}` (ON CONFLICT DO NOTHING). `WebhookFanoutSubscriber` enqueues `webhook_delivery` rows with org-scoping. **Multi-tenant safety**: events with `organizationId = null` (platform-level) skip the webhook fanout entirely — never broadcast across tenants.
- **AEAD secret crypto** — `@noble/ciphers` v2 XChaCha20-Poly1305 + HKDF-SHA256 per-org sub-key from `WEBHOOK_MASTER_KEY` (32-byte hex). Webhook secrets encrypted at rest, plaintext returned **once** at endpoint creation (Stripe-style).
- **Decorrelated jitter** — AWS Architecture Blog formula: `min(cap, random(base, lastDelay × 3))`. `BASE = 1000ms`, `CAP = 12h`, `MAX_ATTEMPTS = 5`. Retry paliers ~1m / 5m / 30m / 2h / 12h, dead-letter after 5 attempts.
- **Request correlation via `AsyncLocalStorage`** — a `requestId` middleware wraps each request in an ALS carrying `X-Request-Id`; `DrizzleOutboxRepository.enqueue` reads it at the single write choke-point and stamps `outbox_event.metadata.requestId`. Chosen over threading `c.get("requestId")` through ~30 call sites because BetterAuth hooks (which emit the majority of events) have no Hono `c` in scope — ALS is the only source that covers Hono routes, BetterAuth lifecycle hooks, and the internal-route cron alike. The actor stays explicit per rule §7 (ALS is for observability only, never authz).

### BetterAuth bridge — 21 unique events emitted automatically (23 emit sites)

3 voies SOTA combinées :

- **`databaseHooks`** (TX-bound, captures all flows including non-HTTP) — USER_CREATED, USER_SIGNED_IN, USER_SIGNED_OUT, USER_ACCOUNT_UNLINKED.
- **`hooks.after` + `createAuthMiddleware`** (path-based, plugin events not exposed in `databaseHooks`) — filter `if (ctx.context.returned instanceof APIError) return` to skip on 4xx/5xx (plugin events fire even on errors otherwise). Paths: `/two-factor/{enable,disable}`, `/passkey/verify-registration`, `/passkey/delete-passkey`, `/verify-email`, `/change-password`, `/link-social`.
- **Native callbacks** — `emailAndPassword.{sendResetPassword,onPasswordReset}`, `magicLink.sendMagicLink`.
- **`organizationHooks`** — afterCreateOrganization, afterUpdateOrganization, afterDeleteOrganization, afterAddMember + **afterAcceptInvitation** (both emit ORG_MEMBER_JOINED — the two lifecycles are independent in BetterAuth, missing the second drops every member who joins via invite), afterRemoveMember, afterUpdateMemberRole, afterCreateInvitation, afterCancelInvitation.
- Race window BetterAuth COMMIT ↔ outbox enqueue documented as accepted (no 2PC available).

### Built-in modules

- **`modules/audit-log/`** — `AuditQueryService.listForOrg(orgId, filters)` (orgId always from session, never query string); `GET /admin/audit-log` (gated `requireOrgPermission({ auditLog: ["read"] })`); `POST /internal/audit-log-purge`.
- **`modules/webhooks/`** — full CRUD `/settings/webhooks` (role-gated), `WebhookDeliveryWorker` with **claim window pattern** (claim batch with `next_attempt_at = now() + (BATCH_SIZE × FETCH_TIMEOUT + 30s)`, fetch HTTP outside TX, update status in fresh TX) — prevents lock starvation under sustained load. HMAC signing format `t=<unix>,v1=<hex-sha256>` (Stripe-style). Idempotency-key `<eventId>:<endpointId>` (UNIQUE).

### Lifecycle

**Boot** — `OutboxDispatcher.start(di)` + `WebhookDeliveryWorker.start()` in `index.ts`. **SIGTERM/SIGINT** — `Promise.all([stopWithTimeout(webhookWorker), stopWithTimeout(outboxDispatcher)])` parallel shutdown (each 25s timeout, fits K8s 30s `terminationGracePeriodSeconds`).

### Decisions clés (non-obvious, locked-in by code)

1. **`databaseHooks` for core models, `hooks.after` for plugin events** — confirmed by reading BetterAuth v1.6.9 source. Plugin tables (`twoFactor`, `passkey`) not exposed in `databaseHooks`. `hooks.after` requires `APIError` instance check (not `"error" in returned` — that pattern misses APIError instances thrown by handlers).
2. **Built-in subscribers run inside dispatch TX, user handlers run post-commit** — atomic for the rail, best-effort for handlers. A user handler throwing doesn't fail `markDispatched`. A built-in subscriber throwing rolls back the entire batch (retried at next drain).
3. **No nested `IUnitOfWork.run`** — Drizzle nested `db.transaction()` opens independent TXs (not savepoints). Events from inner `run` would persist in outbox even if outer rolls back (orphan). Hard guard via `EventCollector.hasContext()` throw.
4. **`organizationId = null` skips webhook fanout** — platform-level events (USER_CREATED, USER_SIGNED_IN) emit without an org context. Without this skip, cross-tenant data leak (every tenant's webhook receives every signup of every other tenant).
5. **AEAD secret stored, plaintext returned once** — Stripe pattern. `WEBHOOK_MASTER_KEY` (32 hex bytes) required at boot in production. Per-org sub-key via `HKDF-SHA256(masterKey, info: "webhook-secret:${orgId}")`.
6. **Claim window pattern in delivery worker** — fetch HTTP outside TX (otherwise 50 deliveries × 30s timeout = 25min TX, kills connection pool). Claim window = `BATCH_SIZE × FETCH_TIMEOUT + 30s buffer`. Idempotency-key on receiver side prevents double-POST if worker crashes mid-fetch.
7. **`hashKey(rawKey)` in UPLOAD events** — sha256-truncated to 16 chars. Raw filename stays only in S3 + the user's session (never in audit_log/webhooks). PII compliance.
8. **`onPasswordReset` + `/change-password` both emit `USER_PASSWORD_CHANGED`** — different flows (reset via email vs. logged-in change), single event type.
9. **Tamper-evidence deferred** — `prev_hash`/`hash` columns posed in `audit_log`, calc gated by `AUDIT_TAMPER_EVIDENCE` env flag (off). Implementation choice (Merkle batch vs. row-lock hash chain) parked until SOC2 audit demands.
10. **3 rounds of multi-agent review** — round 1: 20 issues fixed; round 2: 13 issues (3 invalidated round 1 fixes); round 3: 1 HIGH (`stopWithTimeout` sequential → `Promise.all`) + 1 MEDIUM (`break` on stopping in post-commit loop) fixed.
11. **End-to-end QA pass found 2 real bugs + drove the ORM-first rule.** A 36-test harness catching: (a) `ORG_MEMBER_JOINED` silently missing on `acceptInvitation` — BetterAuth routes it through `organizationHooks.afterAcceptInvitation`, a **separate lifecycle from `afterAddMember`** (which only fires for direct adds, not invites); (b) `UPLOAD_DELETED` declared in the catalog but never emitted. Both fixed. Same QA pass exposed `sql\`...\`` raw fragments where Drizzle has typed helpers — codified as **cross-cutting rule #5** (ORM-first).
12. **`emitEvent` tx-aware + drop swallowing catch (post-merge hardening, May 2026).** Original service-level `emitEvent` opened its own autonomous TX and wrapped in `catch + logger.error`. Two gaps: (a) state change and event emission were not atomic when the caller already had a TX — silent audit/webhook gap; (b) silently swallowed enqueue failures. Fix: optional `tx?: Transaction` arg propagated to `outbox.enqueue`, catch removed. RGPD writes that ship state-change events now wrap in `uow.run`. Upload service and `auth.ts` bridge stay autonomous (no local DB write, hooks don't expose a `Transaction`) — documented limitation.
13. **`docs/EVENT_PIPELINE.md` — pedagogical complement to EVENTS.md.** Visual walkthrough (dual-write problem, 4-phase flow diagram, LISTEN/NOTIFY, two-tier delivery, failure modes, SKIP LOCKED concurrency).
14. **Retention sweeps (Phase 0.6, May 2026).** Three HMAC-gated `/internal/sweep-*` routes purge derived pipeline tables. SOTA 2026 defaults: `OUTBOX_RETENTION_DAYS=7`, `AUDIT_LOG_OPERATIONAL_RETENTION_DAYS=90`, `AUDIT_LOG_COMPLIANCE_RETENTION_DAYS=365`, `WEBHOOK_DELIVERY_RETENTION_DAYS=30`. Batch pattern `DELETE WHERE id IN (SELECT … LIMIT 5000 FOR UPDATE SKIP LOCKED)`. Cron order matters (FK `ON DELETE RESTRICT`): webhook → audit → outbox. **Legacy `/internal/audit-log-purge` retired** — `sweep-audit-log` is a strict superset. Rule §6 gained an **explicit exception** for infra retention sweeps.

---

## Observability — Sentry with IInstrumentation port ✅ Phase 0.4 · May 2026

**Why**: errors silently swallowed in `catch + Result.fail(...)` blocks were the #1 source of "no idea why it broke in prod". SOC2 §CC7.3 + ISO 27001 A.16.1 require monitored incident detection. The SOTA-2026 audit landed on **Sentry only**: OTel sub-Bun 1.3+ requires manual `Bun.serve()` instrumentation and Prometheus `/metrics` is dead code until a Grafana consumer exists.

**Pattern (Lazar-inspired, port-first)**: single `IInstrumentation` port (`startSpan` + `capture` + `addBreadcrumb`) injected via inwire DI. `NoOpInstrumentation` by default, `SentryInstrumentation` swaps in when `SENTRY_DSN` is set — single binding flip in `container.ts`, zero refactor at call sites. Every I/O class receives the port via constructor: outer span per public method, inner span per `query.execute()` / `fetch()` / `client.send()` (OTel SemConv 1.27+ attributes `db.system.name: "postgresql"` + `op: db.query` / `db.transaction` / `http.client` / `function`), catch + capture + return-or-rethrow.

Front (`@sentry/react`): `Sentry.ErrorBoundary` wraps the router with shadcn `AppErrorFallback`, React 19 `createRoot` receives `onUncaughtError` / `onCaughtError` / `onRecoverableError` handlers from `Sentry.reactErrorHandler()`. Sentry Vite plugin gated on CI secrets; `sourcemap: "hidden"`. `beforeSend` scrub whitelist drops `email`, `username`, `ip_address`, `cookie/Cookie`, `authorization/Authorization`, `x-csrf-token`. `sendDefaultPii: false`.

### Decisions (Phase 0.4)

1. **Single merged port** (vs Lazar's two separate `IInstrumentationService` + `ICrashReporterService`). Both surfaces consume the same `Sentry` global; splitting forces double-wiring at every call site for zero portability gain.
2. **Sentry-only, OTel + Prometheus deferred to D.1.** Bun OTel auto-instrumentation requires manual `Bun.serve()` wiring (not stable until Bun 1.4); `prom-client` without Grafana scrape = dead code. Ship infra cross-cutting only when a consumer exists.
3. **`SentryInstrumentation` constructor-injected, NOT module-level singleton.** Mirrors `IEmailService` / `IStorageService` pattern. Sentry SDK *init* remains a side-effect import (the SDK detains global state — wrapping that init would just recopy `Sentry.*` and lose typings).
4. **`createErrorHandler(instrumentation)` factory pattern for `error.middleware`.** Middlewares importing `di` directly would risk a runtime cycle if any module imported back into `shared/middleware/`. Factory takes the dep as a parameter, called once in `index.ts` after `di.build()` — cycle-immune.
5. **NoOp + Sentry surfaces stay symmetric.** Front `noop.ts` + `sentry.ts` export identical signatures. Swap = single import path change; no runtime alias gymnastics.

---

## Disaster recovery — PITR-first, doc-only deliverable ✅ Phase 0.3 · May 2026

**Why**: SOC2 §A.1 + ISO 27001 A.12.3 require a tested backup/restore policy. The original roadmap expected a `pg_dump` cron route in the API; SOTA 2026 audit reversed that decision.

**Why no code shipped**: Every managed Postgres provider (Railway, Neon, Supabase, AWS RDS, Fly) ships PITR one-click with sub-minute RPO and 7–35 d retention. [`pgBackRest` lost its maintainer in 2026](https://thebuild.com/blog/2026/04/30/after-pgbackrest/) — building a clean-stack route on top would have duplicated what the platform already does, forced `postgresql-client` into the Docker image, and introduced streaming/OOM/timeout failure modes the cloneur inherits for zero value. clean-stack ships cross-cutting multi-tenant infrastructure — backup is infra DB, owned by the provider.

Deliverables: `docs/DISASTER-RECOVERY.md` covering RPO/RTO targets, 3-2-1 rule applied, restore runbook, PITR pointers per provider (Railway, Neon, Supabase, AWS RDS, Fly, self-hosted WAL-G — pgBackRest flagged unmaintained), weekly portable `pg_dump` export recipes (GitHub Actions, Railway Cron, K8s CronJob), monthly automated restore-test recipe.

### Decisions (Phase 0.3)

1. **Doc-only.** No route, no script, no Docker image change. SOTA-2026 made the boilerplate-side code obsolete before it was written. Encoded as the **anti-NIH default** for infra layers a provider already owns — applies to Phase 0.4 candidates too.
2. **`backups/postgres/` prefix in the existing S3 bucket**, not a dedicated bucket. Trade-off accepted: lifecycle policy applies to the whole bucket, slightly less SOC2-friendly. Simpler ops; the lifecycle filter `Prefix: "backups/postgres/"` still isolates the expiry rule.
3. **Read-only Postgres role for the export job**, not the API role. `pg_dump` only needs `GRANT CONNECT, USAGE, SELECT`. CI-secret-leak best practice.
4. **No `pnpm db:smoke` script committed.** The verification step is a 15-line inline snippet in the doc; adding it to the boilerplate would couple to a specific schema enumeration that drifts on every domain change.
5. **No GitHub Actions workflow committed.** Committing `.github/workflows/postgres-export.yml` would silently fire on every fork without secrets — bad UX. Documented YAML stays inert until copied.

---

## Health probes — `/livez` · `/readyz` · `/startupz` ✅ Phase 0.2

**Why**: K8s / Railway / Fly / Render all probe liveness/readiness/startup; absence = restart loops + 502s during deploys. SOTA 2026 = three probes, IETF `draft-inadarei` response format, graceful shutdown wired to `/readyz`. Full per-PaaS recipes in [`docs/HEALTH-PROBES.md`](HEALTH-PROBES.md).

- Each infra-owning module ships an `XxxHealthProbe implements OnInit` that self-registers at `di.preload()` — `trash` the module removes its probe in one shot, no orphan.
- `/livez` liveness, **no dependency hit** (a DB outage must not restart pods → thundering herd). `/readyz` aggregates checks (db `SELECT 1` critical, storage `HeadBucket` non-critical), tri-state `pass`/`warn`/`fail` → 200 unless critical fails (503).
- Asymmetric cache (positive 30s / negative 5s) + self-cancelling 5s timeout on `/readyz`. Mounted **outside** requestId/httpLogger/cors/session middleware (probes carry no cookies; ~17k hits/day/pod would drown logs).
- **Graceful shutdown** — `SIGTERM` flips `lifecycleState` → `/readyz` returns 503 within one probe interval (LB drains), waits `SHUTDOWN_GRACE_PERIOD_MS` (15s default), then stops the workers. Without it: intermittent 502s on every deploy.
- **Prod-validation hardening (Jun 2026)** — `/livez` + `/startupz` payloads trimmed to `{status, uptimeMs}`; build metadata moved behind `/internal/build-info` (HMAC-gated). Public probes were an info-disclosure vector (version fingerprinting + exact-source mapping for private clones).

---

## Removability dry-run — first leaf removed end-to-end ✅ Phase 0.5 · May 2026

**Why**: the vertical-slice contract claims "a leaf feature is removable in 5 minutes". Until one was actually removed end-to-end, that was theory. Runbook + worked example + edge cases in [`docs/REMOVABILITY.md`](REMOVABILITY.md).

Removed `modules/rgpd` end-to-end in a throwaway worktree: **46 files touched, −2980 LOC net**, 3 `DROP COLUMN` migration. All 6 gates green (`type-check`, `ci:check`, `check:unused`, `check:duplication`, `build`, `test`).

**4 surprises captured** — a 3rd RGPD column missed by the initial cartography, a transitively-dead `throwApiError` helper, a dangling knip pattern, pre-existing test fails unrelated to the removal. Contract holds: TS error-points the rest.

**6-axis checklist** codified (schema barrel, DI `.addModule()` + `app.route()`, access-control statements, front nav, email templates) — the canonical "how to remove a feature".

---

## Railway reference deploy — config-as-code SOTA 2026 ✅ Phase 0.7 · May 2026

**Why**: clean-stack mentioned Railway in 3 docs but no cloneur had ever validated the boilerplate end-to-end. The existing Railway project fell back to Nixpacks (no `railway.toml`) and couldn't drive the pnpm + Bun monorepo. Phase 0 couldn't be closed with this gap.

**SOTA 2026 pattern**: monorepo "shared root" — all services point `rootDirectory = /` (build context = repo root to resolve `packages/`), each has a **custom config file path** (`infra/railway/<service>.toml`). `cronSchedule` native in `deploy` block. Reference Variables (`${{shared.NAME}}`, `${{Postgres.DATABASE_URL}}`) for cross-service secrets — never duplicated.

`apps/api/src/cron/sweep.ts` — chains the 3 sweeps in FK order (webhook → audit → outbox) via `signedInternalFetch`. Reads `API_URL` and `INTERNAL_SIGNING_KEY` from env, `process.exit(1)` on first non-2xx. Bundle entrypoint added to `bun build` alongside `index.ts` + `migrate.ts`. The cron Railway service **reuses the api image** (single Dockerfile, single source of truth) — no separate `cron.Dockerfile`.

### Decisions (Phase 0.7)

1. **Single-source cron: Railway Cron only, no GH Actions fallback.** User explicit decision after the first plan proposed both. Multiple cron paths = noise + risk of desync. If a cloneur wants another scheduler, the runbook documents the swap.
2. **Storage: Cloudflare R2 by default, Railway Bucket as documented alternative.** R2 free tier 10 GB + zero egress > Railway Bucket. The trap: Railway Bucket egress (service→bucket) is billed at public network rates — invisible in the Railway pricing page. Calculated inline in the runbook.
3. **Cron service reuses the api image, no dedicated Dockerfile.** Single source of truth for the binary. `startCommand` override + `cronSchedule` in the service dashboard suffice.
4. **Custom config file path in dashboard, not multiple `railway.toml` at root.** Railway 2026 supports only one `railway.toml` per service-root. For shared build context (= repo root, required for `packages/`), only option = `rootDirectory = /` for all 3 services + 3 different config paths in the dashboard. Not reproducible via file alone — documented as manual step 1 in the runbook.
5. **No `preDeployCommand` for migration.** Keeps the pattern `CMD migrate && start` portable (Fly, K8s, Cloud Run). `preDeployCommand` is a Railway optimization for > 5 replicas; defer to operational phase.
6. **No `numReplicas = 1` explicit.** First iteration had it — invalid: this field only exists under `[deploy.multiRegionConfig.<region>]`. Default = 1 implicitly.
7. **No GH Actions deploy workflow.** Railway watch `main` natively + `watchPatterns` per service = zero glue needed. First iteration had a matrix workflow hitting Railway Deploy Webhooks — removed (double-deploy with native watch, unnecessary GH secrets, violates single-source).

### Prod-validation closeout (Jun 2026) — live on `main`, release 1.19.2

The config-as-code shipped but no one had run it end-to-end. Bringing the reference deploy green on Railway surfaced a **stack of prod-boot traps**, each masking the next. All fixed:

- **`NODE_ENV` override trap.** A Railway service var `NODE_ENV=development` *overrode* the Dockerfile `ENV NODE_ENV=production` (service vars beat Dockerfile `ENV` at runtime). In dev mode the logger loads `pino-pretty` — a devDependency absent from the `--prod` install → instant boot crash (`unable to determine transport target for "pino-pretty"`). Never set `NODE_ENV=development` in prod.
- **`@packages/access-control` declared `better-auth` as `peer`/`devDependency`, not a `dependency`.** A workspace package that imports a lib in its *runtime* source must declare it under `dependencies`, else `pnpm install --prod` skips it → `Cannot find module 'better-auth/plugins/access'` in the pruned prod image. Compiles in dev (hoisting + devDeps present), breaks only in the pruned prod image.
- **Email + storage threw at boot.** `di.preload()` is eager, so `ResendEmailService` and `S3StorageService` fail-hard'd when unconfigured. Changed to **warn-and-degrade**: email logs-not-delivers, storage swaps to `NoOpStorageService`. **Reverses the Phase 1 "boot-time fail-hard in production" email decision** — right for a configured SaaS, wrong for a clonable boilerplate that must boot before the cloner wires Resend.
- **`app` service Start Command override.** A leftover Railway Start Command `pnpm --filter app start` *replaced* the Dockerfile Caddy `CMD` in the `caddy:2.11-alpine` runner (no Node/pnpm) → container exits instantly with **zero logs**, healthcheck never passes, deploy fails silently. Cleared the override so the Dockerfile `caddy run` CMD applies.
- **Cross-site cookies.** `app` and `api` on different `*.up.railway.app` hosts = different sites. BetterAuth session cookie set to `sameSite: isProd ? "none" : "lax"` so it survives the cross-site credentialed `fetch`. Custom domain under one shared parent (`api.x.com` + `app.x.com`) → `lax` works and is preferable.

**Lessons (locked in):**
1. **`railway up` deploys local working-tree code; a variable change / *Redeploy* / git push rebuilds from the connected branch.** During the fix loop `railway up` was the only way to test uncommitted code; a mid-fix variable change rebuilt from `main` (no fixes yet) and re-crashed — confirming the model.
2. **`RAILWAY_GIT_COMMIT_SHA` only populates on branch deploys**, not `railway up`. `GIT_SHA`/`BUILD_TIME` show `unknown` under `railway up`.
3. **A multi-service deploy fails one layer at a time.** Each ~3-minute build only reveals the *next* boot trap. Pre-scan for the whole class (eager-preloaded constructors that throw, peer-deps imported at runtime, dashboard overrides).

---

## Right to rectification (Art. 16) + NIST 800-63B-4 ✅ Phase A.1 · Jun 2026

**Why**: two non-negotiables bundled in one push. Art. 16 GDPR requires a working edit-profile surface. NIST SP 800-63B-4 final (August 2025) is the SOTA password baseline — minimum length 15, HIBP breach screening, no complexity rules. Both touch the same surface (`/settings/account` + auth flows).

- **`IPasswordBreachService` port** + **`HibpPasswordBreachService`** — HIBP k-anonymity (`api.pwnedpasswords.com/range/<sha1[:5]>`, `Add-Padding` header, timeout `HIBP_TIMEOUT_MS` default 3000 ms). **Fail-open** on network error — breach check failure is captured and logged but never blocks the user.
- **`findPasswordViolation()` + `validatePassword()` helpers** (`shared/password-policy.ts`) — pure, unit-testable. `findPasswordViolation` bans email-local-part, display name, and app name. The inline ~20 common-password list was dropped — HIBP already covers every common password, so it was dead weight.
- **`pendingEmail` field** — nullable `pending_email` column exposed as a BetterAuth additionalField. Set in `sendChangeEmailConfirmation`, cleared on effective change — drives the front "pending change" badge.
- **Password field UX (NIST-aligned)** — show/hide reveal toggle + optional `description` slot. Policy rejections (HIBP breach, contextual ban, wrong current password) surface **inline on the offending field** via `form.setError` instead of a transient toast.

### Decisions

1. **15 chars everywhere, no MFA exception** — the 8-with-MFA floor is a NIST *permission*, not an obligation. Implementing the two-tier would add session-state coupling to the password validator with zero security benefit at this scale.
2. **HIBP fail-open** — a transient HIBP outage must not prevent users from signing up or resetting. The risk of accepting one pwned password during a 3-second HIBP blip is lower than locking out all sign-ups.
3. **Validation via `hooks.before`, not `password.hash` override** — `password.hash` intercepts only hashing; `hooks.before` intercepts at the route level before any BetterAuth processing. Cleanly separates validation (policy) from hashing (crypto).
4. **`user.changeEmail` confirmation to the current address** — confirms the current owner is aware of the change before the new address takes effect. BetterAuth auto-handles the verification challenge to the new address.
5. **No `/settings/profile` page** — rectification fields live in `/settings/account`. A dedicated tab is reserved for Phase A.5 (Privacy dashboard).
6. **Password policy extracted to a pure `validatePassword()`** — the security-critical logic can't be unit-tested inside a BetterAuth hook (hooks aren't testable in isolation), so it lives in `password-policy.ts` and the hook is a one-line caller.

### Change-email flow (2-step, BetterAuth)

`user.changeEmail` runs a **two-confirmation** flow — neither the request nor the first click mutates `user.email`:

1. **Request** — `authClient.changeEmail({ newEmail, callbackURL })` → our `sendChangeEmailConfirmation` hook sets `pendingEmail = newEmail`, emits `user.email.change_requested`, and mails the **current** address a confirmation link.
2. **Confirm (current address)** — the link hits `/api/auth/verify-email?token=…`. BetterAuth mints a second token and mails the **new** address a verification link. Email still unchanged.
3. **Verify (new address)** — this flips `user.email` to the new value. `databaseHooks.user.update.after` clears `pendingEmail` and emits `user.profile.updated`.

**Mail links point at the API** (not the app front) — for this one auth mail the click *is* the state transition (BetterAuth applies it server-side), then redirects to `callbackURL`. The other auth mails (reset, magic-link, verify) route through the app because the front consumes their token.

---

### Prod-validation closeout (Jun 2026) — live on `main`, release 1.19.2

*(See Railway Phase 0.7 above for the full prod-boot trap log — this closeout was part of the same merge sequence.)*

---

## Privacy / Terms versioning ✅ Phase A.2 · Jun 2026

**Why**: Art. 7 §1 RGPD — "the controller shall be able to demonstrate that the data subject has consented". The boilerplate had zero versioning — a cloner shipping a policy update had no way to re-prompt users or produce compliance evidence. This phase closes that gap.

- **`@packages/policies`** — source-only package. Exports `POLICY_TYPES`, `POLICY_VERSIONS` (`Record<PolicyType,string>`, both `"2026-01-15"`), `POLICY_CHANGELOG`. Imported by api (gate + service), app (sign-up form + page render), and `@packages/drizzle` (schema enum). **Single place to bump a version** — every consumer sees the change at compile time.
- **Append-only `policy_acceptance` table** — `(userId, policyType, policyVersion, ipAddress, acceptedAt)` + composite index `(userId, policyType, acceptedAt DESC)`. Two-layer compliance trail: this table is the live gate evidence; the durable 7-year compliance trail lives in `audit_log` via `user.policy.accepted` event.
- **`requireCurrentPolicies` middleware** — throws `HTTPException(409)` when any policy is stale. Composable, not mounted globally — the front `_shell` `beforeLoad` redirect is the primary UX enforcement today; the middleware is opt-in for business routes needing hard server-side gating.
- **Acceptance gate `/legal/accept`** — adapts to context: new user sees "Before you get started" + links to policies; returning user with stale version sees changelog diff. One Accept button either way; on success navigates to the originally intended route.

### As-built deviation: acceptance recorded at `/verify-email`, not `/sign-up/email`

The original plan proposed recording acceptance at `/sign-up/email`. Changed during implementation for two reasons:

1. **No session at sign-up.** With `requireEmailVerification: true`, `/sign-up/email` has no session yet — reading a reliable `userId` from the response is unsafe because BetterAuth returns a *synthetic user* on duplicate-email attempts (anti-enumeration).
2. **`/verify-email` is the natural idempotent boundary.** This route fires exactly when the user proves ownership of their email address. `getStaleTypes(userId)` makes the call naturally idempotent — a user who re-verifies after an email change is a no-op.

**Safety net**: the front `_shell` `beforeLoad` gate redirects any authenticated user with stale policies to `/legal/accept` regardless of auth path.

### Decisions

1. **`@packages/policies` as SSOT, not a front-only config.** The version string must be the same on the API, the front, and the DB schema. A front-only config means the API has a hardcoded constant elsewhere — drift. The shared package eliminates the sync requirement entirely.
2. **Append-only `policy_acceptance`, not an upsert.** Compliance requires the full history of when each version was accepted. An upsert destroys past evidence.
3. **Not DDD.** The acceptance rule is `latestAcceptedVersion === currentVersion` — a comparison, not an invariant requiring aggregate lifecycle protection. If the rule fits in a comparison, it's infra.
4. **`/verify-email` hook, not `/sign-up/email`** — see deviation note above. The gate-predicate (front `_shell`) is the primary enforcement; the hook is best-effort defense-in-depth.
5. **`requireCurrentPolicies` composable, not global default.** Mounting it globally would make every current API call return 409 for a stale user — too aggressive.

---

## Security perimeter — rate-limit + CSP + CSRF ✅ Phase C.1 · Jun 2026

**Why**: a boilerplate that ships auth, multi-tenant, and billing without a security perimeter is a liability for every cloner. Phase C.1 closes the four cheapest attack vectors: brute-force/credential-stuffing (rate-limit), XSS script injection (CSP), CSRF, and CSP telemetry.

- **`requireRateLimit(deps, policy)` factory** — on blocked: sets `Retry-After`, throws `AppErrorException({ code: "SECURITY_RATE_LIMITED" })` → 429. On first block: emits `security.rate_limit.exceeded` event if `policy.emitSecurityEvent`. On store error: either 503 `RATE_LIMITER_UNAVAILABLE` (fail-closed) or warn + pass-through (fail-open) — controlled per policy.
- **8 auth-burst policies** (all IP-keyed, `failClosed: true`, `emitSecurityEvent: true`). `GLOBAL_POLICY` and `CSP_REPORT_POLICY` remain fail-open.
- **BetterAuth built-in `rateLimit` disabled** — the Hono middleware is the single 429 path. One envelope, one store, one set of headers. BetterAuth's built-in has its own 429 shape and its own in-memory store.
- **Durable Postgres store** (`rate_limit` table) with dedicated pool (max: 3, connectionTimeoutMillis: 500 ms) — separate from the app pool (max: 20). Pool exhaustion under a DDoS flood cannot spill into application query capacity.
- **`RATE_LIMIT_STORE` env** — `z.enum(["memory", "postgres"]).default("memory")`. Default is `memory` (zero-config dev); set to `postgres` before horizontal scaling.
- **Per-request nonce via Caddy `templates`** — Caddy's native `{http.request.uuid}` provides the per-request nonce. Vite `html.cspNonce` stamps `nonce=` attributes at build time using the placeholder string; Caddy's `templates` replaces it at request time.
- **`POST /csp-report` endpoint** — mounted before the global restrictive CORS (browsers post unauthenticated cross-origin). Handles both `application/csp-report` (legacy) and `application/reports+json` (Reporting API v1). Sets `Cross-Origin-Resource-Policy: cross-origin`. Filters reports whose `document-uri` origin doesn't match `APP_URL` (third-party extension noise).
- **`requireCsrf(deps)` middleware** — Origin-allowlist strategy: safe methods pass through; for all other methods, `Origin` must be present and in `deps.allowedOrigins`. The rejection `reason` is included in the emitted event but **absent from the client response** (no security-decision leak). `allowedOrigins` reuses `env.CORS_ORIGIN` — single source of truth for "who is our front".
- **`TRUSTED_PROXIES` CIDR + `private` keyword** — `resolveClientIp` uses `node:net` `BlockList` to check trust. `private` expands to all RFC1918 + loopback + CGNAT ranges, allowing Railway/PaaS deploys to set `TRUSTED_PROXIES=private` without pinning a non-stable internal IP.
- **`CORS_ORIGIN` fail-hard in production** — `env.ts` throws at boot if unset. Without it the API falls back to `localhost`, silently rejecting the real front.

### As-built deviation: CSRF is Origin-allowlist, not double-submit cookie

The ROADMAP originally specified a `__Host-csrf` cookie + `X-CSRF-Token` double-submit pattern. Dropped for two reasons:

1. **Cross-origin deploy makes double-submit physically impossible.** App and API are on different eTLD+1 origins (`*.up.railway.app`). `document.cookie` is per-origin; `__Host-` forbids `Domain=`; the front can never read a cookie set by the API origin to echo it back as a header.
2. **Origin-header validation is the 2026 SOTA.** Next.js Server Actions, SvelteKit, and Remix all use it. The `Origin` header is unforgeable by the browser (forbidden header), stateless, zero front-end code.

Bearer-authed requests (Capacitor mobile) skip `requireCsrf` entirely: no ambient cookie means no CSRF surface, and a forged cross-origin request cannot set `Authorization` without a CORS preflight that the `cors()` allowlist blocks.

### As-built deviation: CSP nonce in Caddy, not a Hono middleware

The ROADMAP assumed a `csp.middleware.ts` injecting the nonce server-side. That model requires the app server to intercept and modify HTML responses — impossible when the SPA is a pre-built static bundle served directly by Caddy. Caddy's `templates` directive with `{http.request.uuid}` is the correct per-request nonce mechanism for static SPAs: no app-server roundtrip, zero Bun involvement, cryptographically unique per request.

`/csp-report` is public (browsers post unauthenticated — HMAC verification is impossible from a browser context); defended instead by rate-limit + `Cross-Origin-Resource-Policy: cross-origin` + document-uri origin filter.

### As-built deviation: Trusted Types deferred

In `report-only` mode on a non-migrated React app, every React DOM call produces a violation and floods `audit_log` with noise. Browser baseline is also partial: Firefox support is not stable, Safari only reached partial support in 26.1 (2026). The nonce-based CSP ships first; Trusted Types lands once React's DOM abstraction is Trusted-Types-compatible in the project's baseline.

### S5a — Abuse-prevention quick-wins (Jul 2026)

Three OSS signals wired into BetterAuth `hooks.before`, each emitting a `security.*` event. **BetterAuth's Sentinel plugin (`@better-auth/infra`) covers all of this** — credential-stuffing, HIBP, impossible-travel, geo/bot blocking, free-trial abuse — **but it is a paid, API-key-bound cloud SaaS**, which fails the zero-mandatory-SaaS rule. We mined its threat model and shipped the cheap, calibration-free subset ourselves.

- **HIBP breached-password telemetry.** `validatePassword` already rejected Pwned-Passwords hits (A.1); S5a makes the reject *observable* — emits `security.password.breached` only on a genuine breach.
- **Per-account credential-stuffing counter.** A second `IRateLimiter.consume("auth-sign-in:account:<email>", …)` axis on `/sign-in` (5/15min, fail-closed). IP-only is dead against distributed botnets rotating source IPs against one account; the account axis catches exactly that.
- **Disposable-email block.** `IDisposableEmailService` (embedded `disposable-email-domains` ~90k-domain `Set`, O(1)) + DNS MX lookup. **Fail-open**: a DNS error/timeout warns and lets the sign-up through.

**As-built gotcha (cost the demo, not the unit tests): `ctx.context.*` is undefined in a BetterAuth `hooks.before`.** The global before-hook runs before the session middleware, so `ctx.context.request` and `ctx.context.session` are both `undefined` there (they *are* populated in `hooks.after`). The initial implementation read the client IP via `ctx.context.request.headers` → a `TypeError` that (a) escaped uncaught on `/sign-in` → **500 on every login**, and (b) was swallowed by the emit's own `try/catch` on the other paths → **the three events never persisted** despite the 422/429 firing. Unit tests don't mount the BetterAuth hooks, so only an end-to-end pass (`curl` + `outbox_event` query) surfaced it. Fix: read the IP from `ctx.headers`, and load the change-password actor via `auth.api.getSession({ headers: ctx.headers })`. **Lesson: any story wiring a library's lifecycle hooks must be exercised end-to-end — a green unit suite proves nothing about the hook boundary.**

### Decisions

1. **Single unified Hono rate-limit middleware; BetterAuth built-in disabled.** One 429 error envelope, one §8-instrumented store, one set of IETF headers. BetterAuth's built-in creates a second 429 shape and a second in-memory store.
2. **Fail-closed on auth, fail-open on global traffic.** A store outage must not silently disable brute-force protection (OWASP A10:2025). Noted v-next: a circuit-breaker / in-memory fallback would avoid a transient store glitch turning prolonged login into 503.
3. **`env.CORS_ORIGIN` as single source of truth for "who is our front".** The same list feeds `cors()`, `requireCsrf({ allowedOrigins })`, and BetterAuth `trustedOrigins`. Misalignment between cors and csrf would be an open CSRF hole.
4. **`TRUSTED_PROXIES=private` is the correct Railway value.** Trusting private ranges is safe on Railway (reachable only via the platform's edge proxy over the private network) and avoids pinning a non-stable internal IP.
5. **Cookie `sameSite: none` in prod is required; `requireCsrf` is the replacement CSRF layer.** The cross-origin Railway deploy means cookies must be `none` to survive credentialed `fetch`. `SameSite` no longer provides CSRF protection in that topology; `requireCsrf` (Origin allowlist) is the explicit in-app replacement. Cloners who deploy under a single parent domain (`api.x.com` + `app.x.com`) should switch to `sameSite: "lax"`.

### Deployment debt

- `RATE_LIMIT_STORE=memory` is per-replica — state lost on restart, not shared across instances. Switch to `postgres` before horizontal scaling; a second replica with `memory` store effectively halves the rate-limit budget.
- `TRUSTED_PROXIES` must be set (`private` on Railway) before going to production. If unset, all requests appear to originate from the load-balancer IP — rate-limit keys collide and a small burst from one user can trigger a collective lockout.

---

## Compliance docs bundle ✅ Phase A.3 · Jul 2026

**Why**: two legal obligations were shipping as missing pages — GDPR Art. 28 (sub-processor disclosure is mandatory when acting as a data processor for any EU client) and EAA Art. 14 (accessibility statement mandatory since June 28 2025). Bundled with two contractual templates (DPA + DORA annex) because they share the same context window and are all pure Markdown / static config: no DB, no backend, no event. A missing sub-processor page or accessibility statement is a legal violation the moment a clone ships to EU users; a missing DPA template blocks every EU enterprise deal.

- Public pages `/legal/sub-processors` and `/legal/accessibility` (no auth gate). Both linked from the command palette (`LEGAL_ROUTES` group) and `data-rights.page.tsx`.
- Contract templates: `docs/legal/DPA-template.md` (12-clause GDPR Art. 28) + `docs/legal/DORA-annex-template.md` (11-provision DORA Art. 30, mandatory for EU fintech/insurance since Jan 17 2025).
- **`VITE_SENTRY_DSN` empty-string fix** — schema was `z.url().optional()`. `z.url().parse("")` throws (empty string ≠ undefined). Fix: `z.preprocess((v) => (v === "" ? undefined : v), z.url().optional())`. The boilerplate now boots clean on a fresh `pnpm bootstrap` without requiring the cloner to manually delete the empty DSN line.

### As-built deviations

1. **No footer links → command-palette + `data-rights` cross-links.** No global footer component exists in the app shell (top-nav only — SOTA 2026 pattern). Footer links can be added when a global footer is introduced (Phase E.2 marketing site).
2. **`CardTitle` heading tree → `<TypographyH2>`.** shadcn `<CardTitle>` renders as `<div>`, not an `<h2>` — the `<h1>` page title had no `<h2>` children, a WCAG 1.3.1 heading-structure violation. Fixed so the accessibility statement is itself accessible.

### Decisions

1. **0 domain events.** Pages are 100% static reads — no aggregate, no write path, no compliance state change.
2. **`status: "active" | "planned"` split.** Active = contractually engaged today (require DPA coverage). Planned = will require a DPA update before going live (Art. 28 §2 30-day advance notice). This makes the contractual obligation visible.
3. **`url?` + `dpaUrl?` both optional.** Not every sub-processor publishes a DPA URL directly.
4. **Accessibility statement written before A.6 CI gate.** The statement must exist (obligation since Jun 2025); its accuracy improves as A.6 lands. A statement with a complaint contact satisfies the obligation; a blank page does not.

---

## Cookie consent + Consent management ✅ Phase A.4 · Jul 2026

**Why**: la directive ePrivacy + RGPD Art. 7 exigent un consentement valide avant tout dépôt de cookie non-nécessaire. Sans banner conforme, un clone qui ajoute Umami, Plausible, Stripe pixel ou n'importe quel tracker est illégal en EU dès le premier déploiement. A.4 fournit la mécanique de réconciliation guest→user et expose les primitifs (`<ConsentGate>`, `<AnalyticsScripts>`) pour que les cloners branchent leurs outils sans réécrire la couche.

**Pourquoi infra, pas DDD** : `isActive = withdrawnAt IS NULL AND expiresAt > now AND policyVersion = current` est une WHERE clause ; la catégorie = `categories.includes(cat)` ; la validité = comparaison de dates. Même classe qu'A.2 (`modules/policies/`).

- **`@packages/cookie-consent`** — source-only. Exports `CONSENT_CATEGORIES`, `CONSENT_COOKIE_NAME = "cc_sid"`, `CONSENT_GRANT_TTL_DAYS = 180`, `COOKIE_CONSENT_VERSION`. Bump `COOKIE_CONSENT_VERSION` → re-prompt automatique de tous les users.
- **Append-only `consent_record` table** — `subjectId NOT NULL, userId nullable FK`. `subjectId` = UUID généré serveur, stocké dans le cookie `cc_sid` httpOnly. Découple le consentement du compte (un guest peut consentir avant de créer un compte).
- Routes `/consents` (`optionalAuth` — guests ET utilisateurs connectés). Cookie `cc_sid` : `httpOnly: true`, `secure: isProd`, `sameSite: isProd ? "none" : "lax"`. **Pas de prefix `__Host-`** — le déploiement cross-origin rend `__Host-` inutilisable.
- **Rate-limit `CONSENT_POST_POLICY` sur POST/DELETE uniquement** — un GET rate-limité saturait la fenêtre et bloquait l'affichage du banner (bug découvert en test : après plusieurs reloads, le GET `/consents` retournait 429 et la bannière flashait en boucle).
- **`<AnalyticsScripts>`** — exemple d'usage : charge le script `VITE_ANALYTICS_SRC` seulement si `analytics` consenti via `<ConsentGate>`, cleanup React au retrait. `VITE_ANALYTICS_SRC` vide = composant no-op.
- **Toast 429 consolidé** (`observability/query-error-handler.ts`) — `notifyIfRateLimited` centralise le toast 429 pour **toutes** les queries ET mutations, dédup par `id`. L'ancien `rate-limit-toast.ts` (countdown seconde-par-seconde) supprimé — inadapté aux durées `CONSENT_REFUSAL_TTL_DAYS` (heures/jours, pas secondes).

### Réconciliation au login — `hooks.after` + `ctx.context.newSession`

La réconciliation guest→user se fait **entièrement côté serveur**, sans round-trip client, via le hook BetterAuth `hooks.after`. Dans `auth.ts`, si `ctx.context.newSession` est non-null (= login vient d'avoir lieu — signal couvre **TOUS** les flux : password/passkey/magic-link/2FA/email-verify/OAuth), lit `cc_sid` depuis les headers, appelle `ConsentService.reconcile(subjectId, userId)`.

**Pourquoi `hooks.after` + `ctx.context.newSession` et PAS `databaseHooks.session.create`** :
1. `databaseHooks.session.create.after` n'a **pas** accès aux cookies de la requête HTTP — confirmé par la source BetterAuth (le hook reçoit le model `session`, pas les `Request` headers). Lire le cookie `cc_sid` y est impossible.
2. `hooks.after` + `createAuthMiddleware` donne accès aux `ctx.headers`. `ctx.context.newSession` est le signal canonique "un login vient d'avoir lieu sur cette requête, tous flux confondus".
3. Un seul point d'entrée = pas de drift si BetterAuth ajoute un nouveau flux d'authentification.

**Règle générale extraite** : pour exécuter du code à chaque login (tous flux confondus) avec accès aux cookies de requête, utiliser `hooks.after` + `createAuthMiddleware` + vérifier `ctx.context.newSession`. `databaseHooks.session.create` est TX-bound mais n'a pas les headers.

### Décisions SOTA (recherche 2026 vérifiée)

1. **Device-scoped vs user-scoped** — `userId NOT NULL` sur `consent_record` changé en `subjectId NOT NULL, userId nullable`: (a) un guest doit pouvoir consentir avant de créer un compte ; (b) RGPD Art.7§1 requiert une preuve horodatée, pas la session. La réconciliation au login lie le guest au compte sans perdre l'historique.
2. **Réconciliation via `hooks.after`+`newSession`, pas `databaseHooks`** — la contrainte technique (pas d'accès aux cookies dans `databaseHooks`) a forcé ce choix ; la solution couvre tous les flux en un point.
3. **Rate-limit GET exclu** — le GET `/consents` est appelé à chaque rendu initial. Un rate-limit sur GET saturait la fenêtre en quelques reloads normaux et bloquait l'affichage du banner (bug reproduit en test manuel).
4. **Append-only, pas d'idempotence sur record** — la trace complète des changements de consentement est une exigence de compliance. L'auditeur veut voir "l'user avait accepté marketing le 3 juillet, puis l'a retiré le 5" ; une upsert détruirait cet historique.
5. **GPC requalifié hors scope EU** — après SOTA review 2026 : l'EDPB ne l'a pas reconnu comme signal de retrait valide au sens RGPD ; seule la CCPA (California) lui donne force légale. Le modèle opt-in du boilerplate satisfait intrinsèquement la conformité RGPD.
6. **DNT mort** — le W3C a officiellement abandonné la spécification DNT en 2024. Ignorer `DNT: 1` est la posture correcte en 2026.
7. **Google Consent Mode v2 hors scope** — aucun produit Google dans le stack. IAB TCF v2.2 pareillement (heavy, vendor-specific).
8. **`<AnalyticsScripts>` comme exemple, pas comme primitif figé** — le cloner le remplace ou le réutilise. Aucune dépendance runtime sur un outil spécifique.
9. **Toast 429 consolidé** — `CONSENT_REFUSAL_TTL_DAYS=180` produirait des `Retry-After` de plusieurs heures, que l'ancien countdown seconde-par-seconde ne gérait pas.

---

## Billing — Stripe subscriptions + feature/seat gating ✅ Phase B.1 · Jul 2026

**Why**: every SaaS needs billing. B.1 ships the plumbing as permanent infra following the same infra-not-DDD principle as policies (A.2) and consent (A.4). Leaving billing to the cloner means every clone rebuilds the same Stripe webhook idempotency, subscription SSOT decision, seat-gating hooks, and free-tier fallback independently — that is the OpenUp anti-pattern at scale.

**Posture**: zero billing backoffice. Stripe Checkout handles upgrades; Stripe Billing Portal handles subscription management. The app surfaces only the current plan, seat usage, Upgrade button (→ Checkout), and Manage button (→ Portal). Copy and prices live in Stripe; no redeploy to change them.

- **`@better-auth/stripe`** — Stripe customer = per organization (honoring the Phase 2 multi-tenant decision). Plugin manages the `subscription` table + webhook ingestion + `createCheckoutSession` / `createPortalSession`.
- **Subscription state SSOT = `subscription` table** (plugin-managed, webhook-synced). `organization.metadata` carries no plan data. No poll-to-Stripe in the request path.
- **Hybrid catalog** — price + display copy in Stripe Products. Feature entitlements, tier rank, and `maxMembers` in typed code at `modules/billing/config.ts` (`ENTITLEMENTS` map). `metadata.tier` on the Stripe Product is the sole join key. Editing a gate = a reviewable code change, never a silent dashboard edit.
- **Unlimited seats = `null`** (JSON-safe). `Infinity` is not JSON-serializable (`JSON.stringify(Infinity) === "null"` — a silent wrong value). `null` is explicit; the nil-check is `if (maxMembers !== null && current >= maxMembers)`.
- **Seat gates in all three org hooks** — `beforeAddMember` + `beforeAcceptInvitation` + `beforeCreateInvitation` all check `ENTITLEMENTS[tier].maxMembers`. Gating only `beforeAddMember` leaves a window where an admin can issue more invitations than the seat cap allows; the acceptances then fail with an unhelpful error.
- **Three gate axes (transferable pattern)**: (1) Role gate — `billing:["read","manage"]` in `@packages/access-control`. (2) Seat quota — `ENTITLEMENTS[tier].maxMembers`, returns `403 BILLING_SEAT_LIMIT_REACHED`. (3) Tier/feature gate — `requireFeature(flag)` / `requirePlan(minTier)` (back, returning `402 BILLING_PAYMENT_REQUIRED`); `useEntitlements()` / `<FeatureGate>` / `<PlanGate>` (front). `402` = "available on a higher plan" — semantically distinct from `403` (wrong permission) or `401` (unauthenticated).
- **`STRIPE_SECRET_KEY` unset → free-only degradation, no boot failure.**
- **`RgpdService.executeAccountWipe`** — closes the "Stripe customer cleanup during wipe" deferred from Phase 1. Failure is captured and logged (non-fatal — account deletion must never be blocked by a Stripe API error).

### Decisions (B.1)

1. **State SSOT = plugin `subscription` table, not `organization.metadata`**. Metadata is an opaque blob: not queryable by column, not typed at compile time, subject to divergence when a webhook arrives out of order.
2. **Hybrid catalog (Stripe + typed code, `metadata.tier` as join key)**. Pure-Stripe means a feature gate change is a dashboard edit — unreviewed, unversioned. Pure-code means a price change requires a deploy. The hybrid: prices in Stripe (the natural editor), capabilities in code (must pass code review, version-controlled).
3. **`null` for unlimited, not `Infinity`**. `JSON.stringify(Infinity) === "null"` — a silent wrong value. The sentinel `9999` was also ruled out: it silently becomes a real cap if a customer ever reaches it.
4. **Standard unlimited-orgs model**. Capping org count per account requires a cross-org aggregate query on every org-create path — avoidable complexity. The dominant SaaS precedent (Vercel, Linear, Resend) limits seats and features within an org, not org count.
5. **`402 BILLING_PAYMENT_REQUIRED` code suffix required in the response body**. A bare `HTTPException(402)` produces no `code` field in the error envelope — the client-side branch is unreliable.
6. **Whole `billing.*` family = `compliance` retention (no divergence)**. `operational` was considered for `billing.payment.failed` (a transient dunning signal), but keeping the family on one retention lifetime avoids a split audit trail where a failed-payment record is purged before the subscription events that reference it.
7. **Loose-typed `authClient.billing.*` (documented debt)**. `@better-auth/stripe` v1.6.23 client extensions return `any` in client types. The app confines them behind typed adapters in `features/billing/_api/`; the untyped surface is a single file.

### Review catches (pre-merge whole-branch pass)

1. **Portal route missing `billing:manage` gate** — any authenticated member could redirect to the org's Stripe portal and change the payment method or cancel the subscription.
2. **`402` response body missing code suffix** — bare `throw new HTTPException(402)` produced no `code` field; error handler couldn't distinguish it from other 402s.
3. **`beforeCreateInvitation` not seat-gated** — an admin could create 10 invitations for a 3-seat free org; acceptances fail at acceptance time with a generic error and no clear recovery path.
4. **Double `billing.subscription.cancelled` emission** — `subscription.updated` (when `cancelAtPeriodEnd` flips, a *scheduled* cancellation) and `subscription.deleted` (actual termination) are distinct business facts. Fix: only `subscription.deleted` emits `billing.subscription.cancelled`.

---

## Quota gating ✅ Phase B.2

**Why**: the third gate axis in the billing design (Role, Seats, Tier/Feature from B.1) was always quotas — quantitative limits per org per billing period. Shipped as a **dormant, complete skeleton**: no code path calls `requireQuota` or `reserveQuota` today, but the plumbing is wired and knip-whitelisted.

**Two-layer design (anti-TOCTOU)**:
- **Pre-check (`requireQuota` middleware)** — UX-layer, runs before the write, returns `429 BILLING_QUOTA_EXCEEDED` early. Uses `countScopedRows` (a `COUNT(*)`) or the `quota_usage` denormalized counter.
- **Authoritative reserve (`reserveQuota`)** — inside `uow.run()`, acquires a Postgres advisory lock (`pg_advisory_xact_lock(orgId hash, quotaKey hash)`) then recomputes the count within the same TX as the insert. No TOCTOU: the count and the write are atomic.

**Two counting strategies**: Live `COUNT(*)` (default, zero drift, for uploads/projects/seats). Denormalized `quota_usage` (high-volume, `increment(orgId, resource, period, tx)` in same TX as business write, window-aligned on Stripe billing period).

**Atomic reserve decision** — advisory locks chosen over `SELECT … FOR UPDATE` because: (a) the `quota_usage` row may not exist yet (first use in a period), requiring an upsert + lock sequence that advisory locks short-circuit; (b) advisory locks are XACT-scoped (auto-release at TX end); (c) they add zero table contention on the resource table itself.

**SOTA rejections (2026)**:
1. **Stripe Entitlements API** — boolean-only (feature flags, not counts). No quantitative quota, no runtime blocking.
2. **Stripe Billing Meters** — async metering-to-bill, not synchronous gating-to-block. A metered event reaching Stripe does not prevent the next write.
3. **`@better-auth/stripe` native `limits`** — would create a 2nd SSOT (entitlements in code + limits in plugin config). Kept unified in `ENTITLEMENTS[tier].quotas`.

**Why not DDD**: `count(rows) >= limit` is a WHERE clause and a comparison. No aggregate invariant, no domain event. Every quota rule collapses to config lookup + arithmetic. Applying DDD here matches the OpenUp anti-pattern.

---

## Operator audit log — cross-org read + tamper-evident hash chain + `/admin` zone ✅ Phase C.2 · Jul 2026

**Why**: the audit write-path shipped with the event-driven foundation but rows were invisible — no read surface, no integrity proof. C.2 ships the read side as an **operator** (platform-admin) surface: cross-org filtering, a tamper-evidence hash chain, and the first `/admin` front zone (foundation for C.3 admin & impersonation).

- **`GET /admin/audit-log`** — cursor-paginated (limit 1–500, default 50), filters `actorId` / `organizationId` / `targetType` / `targetId` / `actionPrefix` / `occurredFrom` / `occurredTo`. CQRS read side, no use case.
- **Gate: `requirePlatformAdmin`** — operator = `env.PLATFORM_ADMIN_IDS` allowlist OR `user.role === "admin"`, optional MFA via `PLATFORM_ADMIN_REQUIRE_MFA`. NOT `requireOrgPermission({ auditLog: ["read"] })` — the surface is cross-org by design; the `auditLog` statement stays in `@packages/access-control` for a future per-tenant view.
- **Tamper-evidence hash chain** (env-gated `AUDIT_TAMPER_EVIDENCE`, default off) — `audit_log.{sequence,prev_hash,hash}`: SHA-256 over canonical row content + `prevHash`, chain writes serialized via `pg_advisory_xact_lock(hashtext('audit_log_chain'))`. `GET /admin/audit-log/verify` recomputes the full chain → `{ verified, rowCount, brokenAtId, brokenAtSequence }`.
- **Meta-audit** — reading the audit log is itself audited: `security.operator.audit_accessed` emitted only on the first page (cursor absent), not per pagination step.

**Decisions (C.2)**:
- **Operator surface, not tenant surface** — a per-org audit page would either leak platform-level rows (`organizationId = null`) or hide them. A future tenant view (feature-gated `audit_log` in `ENTITLEMENTS`) stays a separate deliverable.
- **Hash chain global, not per-org** — one chain, one advisory lock; per-org chains would multiply genesis edge cases without adding forensic value.
- **Genesis-at-activation** — rows written before `AUDIT_TAMPER_EVIDENCE=true` keep `hash = null`; the chain starts at the first hashed row, so enabling the flag never requires a backfill migration.

---

## Outbound webhooks — SOTA hardening (Plans 1–2) + front UI + public catalog (Plan 3) ✅ Phase C.5 · Jul 2026

**Why (hardening)**: the event-driven foundation shipped the webhook worker with HMAC signing and jitter retry, but left several attack surfaces open: (1) SSRF — org admins can register arbitrary URLs; (2) secret rotation — hard-cutting a secret during rotation breaks all in-flight verifications; (3) delivery forensics — debugging a failing endpoint was guesswork; (4) dead endpoints accumulate retry backpressure.

**Why (front UI + catalog)**: the CRUD API was live but operator access required raw HTTP calls. The public `/developers/events` catalog solves integration onboarding friction: customers need to know what events fire, what their payloads look like, and how to verify signatures.

- **SSRF guard** — DNS-resolves the URL at create/update AND at delivery time. Re-resolving at delivery closes the **DNS-rebinding window** (register a public domain → TTL-0 rebind to `169.254.169.254` by delivery time). Checks: loopback, RFC1918, link-local, ULA, CGNAT, cloud-metadata hosts (169.254.169.254, metadata.google.internal, 100.100.100.200, etc.).
- **Dual-secret rotation** (`POST /settings/webhooks/:id/rotate-secret`) — stores new secret alongside old, sets `rotatedAt = now()`. During grace period (`WEBHOOK_SECRET_GRACE_HOURS`, default 24), worker signs with **both** and emits `t=<ts>,v1=<hex_old>,v1=<hex_new>` in a single header. Consumers accept if **any** `v1=` verifies.
- **Per-attempt delivery timeline** — `webhook_delivery_attempt` table: `attemptNumber`, `requestHeaders`, `requestBody`, `responseStatus`, `responseHeaders`, `responseBody` (capped at `WEBHOOK_RESPONSE_CAPTURE_BYTES`, default 4096 bytes — prevents large HTML error pages from filling the table), `durationMs`, `error`, `attemptedAt`.
- **Auto-disable failing endpoints** — `consecutiveFailures >= WEBHOOK_AUTO_DISABLE_MIN_FAILURES` (default 2) AND first failure was more than `WEBHOOK_AUTO_DISABLE_AFTER_DAYS` (default 5) days ago: `status` flips to `auto_disabled`. Time-based + count-based: count-only would auto-disable within minutes of a brief server restart — too aggressive.
- **Wildcard subscriptions** — `eventTypes` accepts `"*"`, `"<group>.*"`, or exact names. **Internal events** (`webhook.test`, `webhook.endpoint.*`, `webhook.delivery.*`) are never in the expandable set — no infinite-fanout loop.
- **Test event** (`POST /settings/webhooks/:id/test`) — bypasses the fanout subscriber (direct delivery-row insertion). Also auto-inserted on endpoint creation (immediate reachability feedback).
- **4 new internal events** (`webhook.test`, `webhook.endpoint.secret_rotated`, `webhook.endpoint.disabled`, `webhook.delivery.exhausted`) — `operational` retention, non-subscribable, never fanout. **Catalog after C.5: 52 total events, 48 subscribable, 4 internal.**
- **Public developer catalog** (`/developers/events`, no auth) — 48 subscribable events with group, retention label, description, expandable JSON schema (from Zod 4 native `z.toJSONSchema({ unrepresentable: "any" })`). Node.js signature-verification snippet (cross-checked against `hmac-signer.ts`).

### Decisions (C.5)

1. **SSRF guard at both create and delivery time (anti-rebinding)**: validating only at create allows DNS-rebinding — register a safe IP, rebind to `169.254.169.254` by delivery time via TTL-0. One extra DNS lookup per delivery attempt is the accepted cost.
2. **Multiple `v1=` values for secret rotation (Stripe-compatible)**: simpler than a `x-webhook-signature-old` header. Receivers already split on `,` then `=`; iterating pairs and accepting on first match requires ~3 extra lines.
3. **`webhook.test` and `webhook.endpoint.*` as internal events (non-subscribable, non-fanout)**: the test delivery must travel through the delivery worker for realistic integration testing, but must never fan out to *other* endpoints' subscriptions.
4. **Zod 4 native `z.toJSONSchema` for the public catalog**: Zod 4 ships this natively — no external dependency, no walker, no drift.
5. **Separate `EventTypePicker` and `EventTypesTable` components (shared SSOT)**: the SSOT is `SUBSCRIBABLE_EVENT_TYPES` + `descriptionFor` + `jsonSchemaForEvent` in `@packages/events`. The two components are separate because their contracts are incompatible (interactive checkboxes + RHF integration vs. static reference table). Both already depend on the shared SSOT, so description and schema changes propagate to both automatically.
6. **Response body capped at `WEBHOOK_RESPONSE_CAPTURE_BYTES` (default 4096)**: 4096 bytes is enough to see the error type and message for every real-world error format. Configurable for operators who need more context.
7. **Auto-disable threshold is time-based + count-based**: count-only auto-disables within minutes of a brief server restart — too aggressive. Time-based component (`WEBHOOK_AUTO_DISABLE_AFTER_DAYS`) distinguishes "transient outage" from "dead endpoint".

---

## Account recovery codes UI ✅ Phase C.6 · Jul 2026

**Why**: NIST 800-63B-4 §5.1.9 (look-up secrets) mandates that backup codes be stored so the verifier can look up the exact value. BetterAuth encrypts the code set (XChaCha20-Poly1305, symmetric key derived from `BETTER_AUTH_SECRET`), satisfying this posture. The feature completes the 2FA story: users had TOTP enable/disable but no UI to manage recovery codes or use one as a fallback.

- **`RecoveryCodesCard`** on `/settings/account`: regenerate-only (no re-view of existing codes, matching GitHub model). Password gate on regeneration. Codes pre-formatted `xxxxx-xxxxx` by BetterAuth; `BackupCodeList` renders them as-is.
- **Backup-code fallback on `/two-factor`**: "Use a recovery code instead" toggle. Input normalization: whitespace stripped; if result is exactly 10 alphanumeric characters, canonical dash is auto-inserted (`xxxxx-xxxxx`); otherwise passes through as-is. BetterAuth's `verifyBackupCode` does an exact `includes()` comparison on stored `xxxxx-xxxxx` codes, so the canonical dashed form must reach the API.
- **2 new compliance events**: `user.mfa.backup_codes_regenerated` and `user.mfa.backup_code_used` (retention `compliance`). **Emission placement trap**: `/two-factor/verify-backup-code` is a login endpoint; `ctx.context.session` is null. The actor is read from `ctx.context.newSession` (set by BetterAuth after a successful verify), placed before the `userId` early-return guard. Unit tests do not mount BetterAuth hooks; only the runtime QA catches this trap.
- **`BackupCodeUsedNotifier`** — first `onEvent` handler in the project. Sends template `backup_code_used` via email; in dev without `RESEND_API_KEY` logs the variables. SOTA ref: Bitwarden and NetSuite both send on-use email for backup code consumption (breach signal).
- **`formatBackupCode` removed**: BetterAuth's `generateBackupCodesFn` already returns codes pre-formatted as `xxxxx-xxxxx`; a client-side re-formatter produced double-dashes (`abcde-fghij` → `abcde--fghij`).

### Decisions (C.6)

1. **Regenerate-only (no re-view)**: showing codes again widens the exposure window. GitHub model: show once at generation, force re-generate to see new ones.
2. **Encrypted-not-hashed (BetterAuth default kept)**: NIST 800-63B-4 §5.1.9 requires "the verifier can look up the exact value." Hashing would require verifying each hash individually. BetterAuth's symmetric encryption (XChaCha20-Poly1305) satisfies the look-up requirement. No `storeBackupCodes` override was applied.
3. **No remaining-count UI**: showing "8 of 10 codes remaining" encourages users to think of codes as a finite budget and delay regeneration. If a consumer needs it, `backup_code_used` events in the audit log provide the count.
4. **Input tolerance: whitespace stripped, dash auto-inserted on 10-char input**: server comparison is exact, so the canonical dashed form must reach the API. The schema transform handles three input shapes: code pasted with dash (pass-through), code typed without dash (dash re-inserted on exact 10-alphanum match), anything else (passed as-is, fails server-side if wrong).

---

## Privacy dashboard ✅ Phase A.5 · Jul 2026

**Why**: M3 hub consolidating the privacy/compliance surfaces that were scattered across `/settings/account` and missing. Refactor-only — composes A.2 (policy acceptance), A.3 (sub-processors), A.4 (consent), RGPD core (export + deletion), and security (sessions). 0 new domain events, 0 back-end changes, 0 migrations.

- **Page composition**: `<PolicyAcceptanceCard />` (acceptance status + up-to-date badge) + `<ConsentSettings />` (A.4) + `<DataSourcesCard />` (static list of active `SUB_PROCESSORS`) + `<DataExportCard />` (rgpd, relocated) + `<SessionsCard />` (security, relocated from account).
- **`<RgpdDeletionCard />`** relocated to bottom of `account.page.tsx` (contextual danger zone). Deviation from the ROADMAP spec which placed it on the Privacy page.
- **Danger tab dissolved** — `org-danger-card.tsx` + `transfer-leave-dialog.tsx` moved to `features/organization/components/`, rendered at bottom of `organization.page.tsx`.
- **`sub-processors.config.ts` promoted to `apps/app/src/shared/`** — `features/legal/` and `features/privacy/` are both route-owning features and cannot import from each other (import-direction rule); the 2-consumer config belongs in `shared/`.

### Decisions (A.5)

1. **GitHub-style contextual danger zones**: no separate Danger tab. Delete-account at the bottom of the Account page; org leave/delete at the bottom of the Organization page. SOTA convention (GitHub/Linear/Vercel).
2. **`PolicyAcceptanceCard` = status only**: dated/IP acceptance history deferred — `policy_acceptance` has the data but exposing it front-side would require a new back-end route; avoided under "refactor-only".
3. **Direct RGPD download link dropped**: the presigned R2 export key is discarded after the email is sent. A direct link would require a new user column + route + on-demand presign.
4. **`DataSourcesCard` = static list of active `SUB_PROCESSORS`**: no per-user "last-sync timestamp" — it is config, not per-user sync state.
5. **`sub-processors.config.ts` promoted to `shared/`**: two route-owning features cannot import from each other → belongs in `shared/`.
6. **ROADMAP deviation acknowledged**: the ROADMAP placed `<RgpdDeletionCard />` in Privacy; it shipped in Account (danger zone). Contextual danger zones are the SOTA convention — the deviation is intentional.

---

## Email delivery queue — durable outbox + batch worker + in-repo templates ✅ Phase D.5 · Aug 2026

**Why**: `IEmailService.sendTemplate` was a direct Resend HTTP call — 1 email = 1 HTTP request. Any fan-out (RGPD wipe notifying N members, D.3 digests) serialized into 429s against the **10 req/s per team** ceiling. The fix mirrors what the repo already does for webhooks: a durable queue table + a background worker that batches and retries, decoupled from request paths.

- **`email_message` table** — durable outbox for all outgoing emails. Columns: UUID v7 PK, `to_address`, `kind`, `template`, `subject`, `html_body` / `text_body` (rendered at enqueue), `variables` jsonb, `idempotency_key`, `status` (`pending` / `claimed` / `sent` / `failed`), `claimed_until`, `attempts`, `provider_message_id`, `last_error`.
- **`QueuedEmailService`** — binds to `IEmailService`. Enqueues rows inside the caller's transaction when `options.tx` is passed (atomicity with the write that triggered the email). Renders React Email templates at enqueue time via `@packages/emails`.
- **`@packages/emails`** — one React Email component + `subject()` per template key. `TEMPLATE_IDS` in the worker is now an **override map**: empty string → render in-repo template; non-empty → use Resend dashboard ID. A fresh clone sends real emails with zero dashboard setup.
- **`EmailDeliveryWorker`** — polls every 2 s, claims up to 300 rows (`FOR UPDATE SKIP LOCKED`, 120 s claim window), groups by `(kind, template)`, chunks to 100 per `resend.batch.send` call. `batchValidation: "permissive"` isolates bad entries into `errors[]` without aborting the chunk. Decorrelated jitter retry via `shared/jitter.ts`. After the ceiling the row moves to `status = 'failed'` and `email.delivery.exhausted` is emitted.
- **Retention sweep** — `POST /internal/sweep-email-messages` (`EMAIL_MESSAGE_RETENTION_DAYS=7`). Purges only `status = 'sent'`; `failed` rows are kept deliberately as the operator's only trace of a dropped email.
- **RGPD wipe sweep refactor** — `sendTemplateBatch` replaces up to 50 serial `sendTemplate` calls, removing per-member latency fan-out in the wipe path.

### Decisions (D.5)

1. **`email_message` table, not the outbox**: the outbox dispatcher's built-in subscribers run *inside* the dispatch transaction (with `idle_in_transaction_session_timeout = '30s'`), so an HTTP call there holds a Postgres TX open across network I/O. User handlers run post-commit with no retry. Neither slot can hold a retryable external call. `email_message` is the same pattern as `webhook_delivery`, for the same reason.
2. **`batchValidation: "permissive"`**: the original spec proposed replaying the entire rejected chunk one recipient at a time. `"permissive"` is strictly better: the provider isolates invalid entries into `errors[]` and still sends the valid ones — 1 request, no replay. Invalid recipients are marked `failed` individually and kept for operator review.
3. **No `retry-after` parsing**: the Resend SDK returns `{ data, error }` and does not expose response headers. Decorrelated jitter provides the backoff substitute.
4. **Polling at 2 s, not `LISTEN/NOTIFY`**: a persistent `pg.Client` listener costs a dedicated connection plus reconnect handling. The gain is at most 2 s of latency reduction on the first delivery attempt — acceptable for email. `LISTEN/NOTIFY` would be the right call if latency SLA were < 1 s.
5. **`provider_message_id` attached only when `data.length === chunk.length`**: the Resend batch API does not document positional alignment when some entries fail. Attaching `ids[i]` to row `i` when array lengths differ would silently associate wrong IDs. Correctness never depends on `provider_message_id` (debugging only), so conservatism wins.
6. **`@react-email/components` deprecated mid-task**: React Email 6.0 unified everything into the `react-email` package. Migrated to `react-email@6.9.1`.
7. **Bounce suppression is provider-side**: Resend's domain-scoped suppression list automatically blocks future sends to hard-bounced addresses. No local `email_suppression` table needed — build it only when a product feature needs suppression-list reads.

### As-built deviations (D.5)

1. **`TEMPLATE_IDS` as override, not mandatory**: the ROADMAP framed template IDs as required config (boot fails if empty). Post-D.5, an empty string means render the in-repo template. Boot no longer fails on empty `TEMPLATE_IDS`.
2. **`@packages/emails` introduced**: the original ROADMAP spec did not include an in-repo template package. Added to remove the "requires Resend dashboard setup before first email" friction on a fresh clone.
3. **`sendRaw` / `sendRawBatch` on `IEmailService`**: not in the original spec. Added to support future transactional emails needing full HTML control without a named template. No call sites exist today; public port surface.

---

## Admin & impersonation — BetterAuth `admin` plugin ✅ Phase C.3 · Aug 2026

**Why**: every paid SaaS needs staff-level tooling to debug a paying user's issue without asking for their credentials, and a one-click ban path for abuse without DB surgery. BetterAuth ships an official `admin` plugin covering these primitives — no rolling our own. The phase is infra (no DDD), gated by the platform role enforced since C.2.

**What was already in place before this phase**: the `admin` plugin wired in `auth.ts`, the Drizzle schema ban columns and platform `role` column on `user`, the `requirePlatformAdmin` gate, and the `_admin` layout zone in the front. The phase delivered the rest.

**What this phase delivered**:

- **Read-only user and org back-office** — `GET /admin/users`, `GET /admin/users/:id`, `GET /admin/orgs`, `GET /admin/orgs/:id` (paginated, search-filtered), backed by `DrizzleAdminUserStore`, `DrizzleAdminOrgStore`, `AdminQueryService`. Front: `features/admin-users/` + `features/admin-orgs/`.
- **Five audited admin actions** (`AdminActionService`) — ban (with reason + optional expiry), unban, platform role change, force password reset (sends reset email via BetterAuth), revoke all sessions — each emits an `admin.*` event via `emitEvent`.
- **Justified impersonation** — `POST /admin/impersonation/:id/start` requires `reason` (min 1 char) and accepts optional `ticketRef`. `POST /admin/impersonation/stop` validates the BetterAuth response before emitting the audit event (no false audit trail on BetterAuth failure).
- **Server-side blocklist** — two layers: a BetterAuth `beforeHook` in `auth.ts` (`impersonation-blocklist.ts`) blocking the most sensitive auth endpoints, and per-mutation `denyImpersonated` middleware on 11 business mutation routes. Six read-only routes left open. Exit route `POST /admin/impersonation/stop` always preserved.
- **Non-dismissable impersonation banner** — `ImpersonationBanner` component mounted in `_shell`, live countdown from session expiry (`setInterval`, recalculated every second), `variant="banner"` added to the Alert primitive in `@packages/ui`.
- **Transparency email** — `NotifyImpersonatedUserHandler` (`onEvent(ADMIN_IMPERSONATION_STARTED)`) sends the impersonated user a "someone accessed your account" email. Failure captured to telemetry, does not abort impersonation.
- **Session payload extended** — `buildSessionPayload` (`auth-session-payload.ts`) enriches BetterAuth's own session response with `impersonatedBy` (normalized from `undefined` to `null`) and `isPlatformAdmin`. The front reads these fields from the existing session query; no dedicated admin session endpoint exists.
- **Event catalog 55 → 62** — seven new `admin.*` events added to `@packages/events`, all `compliance` retention.

**Structural decision — `AdminActionService` outside inwire**:

`AdminActionService` is instantiated in `routes.ts` rather than registered in the inwire container. The reason is a real import cycle (`service → auth.ts → container.ts → module.ts`) that cannot be resolved without touching `auth.ts`, which is protected by its own module boundary. Its dependencies (`IOutboxRepository`, `IInstrumentation`) are still resolved from `di`. The same pattern applies to the impersonation routes. Validated and accepted in review.

**Decisions**:

1. **Write-enabled impersonation with server-side blocklist** — read-only impersonation cannot reproduce write-path bugs. The blocklist specifically targets irreversible or identity-mutating operations: change-email, change-password, MFA enable/disable, link/unlink social account, revoke-sessions, billing portal. Read operations and the exit route stay open.
2. **Mandatory justification** — `reason` is a required field on `POST /admin/impersonation/:id/start`. No reason = 400 before any impersonation session is issued. Optional `ticketRef` links to a support ticket.
3. **Transparency email** — the impersonated user is notified at impersonation start. Failure is captured to telemetry and logged but does not block the action. `supportUrl` is derived from `APP_URL`.
4. **No `support` platform role** — the original plan mentioned a read-only `support` role. BetterAuth's `admin` plugin supports a single platform role column. Adding a `support` role would require custom middleware with zero library support. Deferred out of scope.
5. **`cookieCache.maxAge` reduced to 60 s** — makes a ban effective within approximately 60 s without adding a session revocation list lookup to every request. Updated in `apps/api/CLAUDE.md`. Near-instant ban (< 1 s) would require a revocation list checked in the session middleware — out of scope.
6. **Actions through custom API routes, not the BetterAuth admin client** — wrapping `auth.api.*` in custom Hono routes lets the implementation inject `actorUserId` into every event, enforce `reason` on impersonation, and validate BetterAuth responses before emitting the audit event. Two API deviations found during implementation: `auth.api.forgetPassword` does not exist — the correct method is `auth.api.requestPasswordReset`; `auth.api.setRole` requires `{ requireHeaders: true }` and a `headers` argument from `c.req.raw.headers`.
7. **`/stop` validates BetterAuth before emitting** — if BetterAuth's `stopImpersonating` returns an error, the `ADMIN_IMPERSONATION_STOPPED` event is not emitted. This prevents a false audit trail entry when the stop actually failed.

**Out of scope** (explicit):
- Dedicated admin subdomain (`admin.<APP_DOMAIN>`).
- Platform `support` role (read-only).
- Org mutations (member kick, org delete) from the admin back-office.
- IP allowlist for admin access.
- Session-length alerting.

### QA-phase corrections (post-initial delivery)

1. **`APP_URL` promoted to required** — Five call sites in `auth.ts` (auth email links) and the impersonation notification already assumed `APP_URL` was present and produced `undefined/...` links when it was absent. The optional declaration was the anomaly. Changed from `z.url().optional()` to `z.url()` in `shared/env.ts`. The task-15 deferred concern about `supportUrl` being inoperable is closed by this change.

2. **MFA gate on the front-side back-office entry** — The server already required MFA (`PLATFORM_ADMIN_REQUIRE_MFA`), but the front-side gate checked only the platform role. `canAccessPlatformAdmin` (`shared/auth/can-access-platform-admin.ts`) was extracted to combine `isPlatformAdmin` (role) with `twoFactorEnabled` (MFA). A platform admin without 2FA sees neither the "Admin" nav entry nor the `_admin` route zone — `ensure-platform-admin.ts` redirects them to `/settings/account` rather than `/`, so the required action is explicit. `isPlatformAdmin` is kept as a separate predicate for call sites that only need the role check (e.g. event payloads).

3. **Policy acceptance blocked during impersonation** — `denyImpersonated` was added to `POST /me/policies/accept` (defense-in-depth: an admin in impersonation session must not countersign legal terms on behalf of the user, which would write a legally false acceptance). The Decision 1 enumeration above used the collective term "the blocklist" for both layers; this item falls under the `denyImpersonated` Hono layer, not the BetterAuth hook. Mirrored on the front: `shouldRedirectToLegalAccept` (`router/should-redirect-to-legal-accept.ts`) returns `false` when `isImpersonating(session)` is true, so the legal acceptance gate does not trap the admin on a page whose only exit is to consent.

4. **Nav entry renamed "Operator" → "Admin", re-pointed to `/admin/users`** — The shell nav entry linked to `/admin/audit-log` under the label "Operator". Post-QA it links to `/admin/users` (the accounts list) under the label "Admin", consistent with the product's English convention and with the primary use-case (looking up a specific user before impersonating). The `pathname.startsWith("/admin")` active-state check already covered all sub-pages. The term "operator" remains accurate in conceptual contexts — this log, the C.2 section header — where it describes the human role, not a UI label.

5. **Admin UI translated to English** — The admin features were initially written in French, inconsistent with the rest of the product. All UI copy (column headers, button labels, form placeholders, error messages, date locales) was translated to English (commit `27ccbff`).

---

## Enterprise SSO (OIDC + SAML) + SCIM provisioning ✅ Phase C.7 · Aug 2026

**Why**: single biggest enterprise-tier price multiplier ($10-30k/deal, recurring) — every B2B SaaS targeting >500-employee customers is blocked at procurement without SSO + SCIM. `@better-auth/sso` (OIDC + SAML 2.0) and `@better-auth/scim` (RFC 7644) are official BetterAuth plugins — no rolling our own protocol handling.

**What this phase delivered**: `sso()` + `scim()` mounted in `auth.ts` on their own schema file (`packages/drizzle/src/schema/sso.ts`); per-org OIDC/SAML provider registration + domain verification + a SCIM bearer-token per provider; JIT provisioning landing a `member` row on first SSO sign-in; domain-based SSO enforcement rejecting non-SSO sign-in on all four email/passkey paths; a full SCIM `Users` lifecycle; `/settings/sso` (provider forms, domain verification card, SCIM connection card, enforcement toggle); a "Sign in with SSO" entry on `/sign-in`; 13 new events; a local Keycloak profile + round-trip doc for development. Catalog **67 → 80 (28 → 34 public, 39 → 46 internal)**.

**Decisions and deviations from the plan** (chronological across the phase's tasks):

1. **Business-tier gate keyed on the request's target org, not session history** — `providersLimit` (the SSO plugin's own anti-abuse ceiling) only ever receives `user`, never the org the registration targets, so it cannot enforce the `business`-tier `sso` entitlement. The gate lives instead in `hooks.before` on `/sso/register`, reading `body.organizationId` directly — the org actually named by the request, never inferred from `session.activeOrganizationId` (a stale or switched active-org would otherwise gate the wrong org). Provider registration also checked against impersonation (`denyImpersonated`-equivalent at the hook level).
2. **SAML hardened beyond the plugin's defaults** — every SAML registration forces `signatureAlgorithm: "sha256"` and `wantAssertionsSigned: true` server-side; the client never gets to choose a weaker option. The reject list covers the whole `sha1`/`md5` **family** (not just the bare algorithm string — `rsa-sha1`, `hmac-sha1`, etc. all match), closing a bypass the first pass missed.
3. **Domain casing normalized on both read and write paths** — `sso_provider.domain` is persisted verbatim by the plugin (no casing normalization on its side), and every domain-based lookup used for enforcement (`enforcedProviderForDomain`) has to compare case-insensitively or `Acme.com` and `acme.com` silently diverge into two providers. Fixed on the write path (register **and** update-provider — the second one was a follow-up fix after the first pass missed the update path's own domain-change branch) and the read path, using `eq(sql\`lower(${column})\`, domain)` rather than `ilike` (`ilike` treats its argument as a pattern, not a literal — a domain containing `_` or `%` would match unintended rows).
4. **SSO enforcement covers all four sign-in surfaces, not just the password form** — `/sign-in/email`, `/sign-up/email`, `/sign-in/magic-link` are checked in `hooks.before` (`isSsoEnforcedFor` against the request's email, before the rate-limit branch — which `return`s for `/sign-in/email`, so anything placed after it would never run). Passkey sign-in carries no email, so it can't be checked path-based; it's closed separately in `databaseHooks.session.create.before` (**note, superseded**: this leg was originally keyed off whether the session's linked account already belongs to a registered SSO provider — that is exactly the defect fix round 2 item 2 below removes, since an SSO account is permanent and would wave through every later passkey sign-in. It now keys on the request's endpoint path instead). All four return `403 { message: "SSO_REQUIRED", providerId }` — confirmed live that `providerId` survives JSON serialization, so the front never re-derives the provider from the email.
5. **No way to turn enforcement ON was in the original plan** — the plan shipped `ssoEnforced` as a read/display flag with no mutation endpoint. Added `POST /settings/organization/sso-enforcement` (`organization:["update"]`), and separately extended it so a platform admin can also flip it on an org's behalf (`admin.orgs` back-office), since support needs to unblock an org that locked itself out.
6. **D3 — no `sso: [...]` access-control statement exists.** The original plan called for a dedicated `sso: ["configure", "enforce"]` statement in `@packages/access-control`. It was never built; the existing `organization:["update"]` permission already covers `/settings/sso` and the enforcement toggle, and adding a parallel statement for the same actors (`owner`) would have been a distinction without a difference. `docs/FEATURES.md` and `ROADMAP.md` are corrected to stop describing it as built.
7. **D9 — SCIM `DELETE` is an org departure, not a grace-period deletion.** The original plan's step 3 described deprovisioning as reusing the RGPD grace path (`pendingDeletionUntil` + revoke sessions). What's actually implemented: `DELETE /scim/v2/Users/<id>` removes only the `member` row for the owning org; the global `user` row (and any other org's membership) survives untouched. Verified live in this task: `select * from member` returns zero rows for the deprovisioned user in the target org while `select * from "user"` still returns the row. `ROADMAP.md` and `docs/FEATURES.md` are corrected.
8. **Every SCIM/SSO event payload carries `actorUserId`, including SCIM's bearer-token-only requests** — SCIM endpoints authenticate with a token, not a session (`ctx.context.session` is empty), so the actor for `scim.*` events is resolved from the connection row (the user who generated the token) rather than from session state (**note, superseded**: this originally read the row with `scimConnectionOwner`, which trusts the provider id claimed by the bearer header without ever checking the token — see the post-PR review round below, where it becomes `verifiedScimConnectionOwner`). Pre-delete snapshots (`ssoProviderDeleteSnapshots`, `scimConnectionDeleteSnapshots`, keyed on `providerId`) supply `organizationId` for the `*.deleted`/`*.connection.deleted` events, since the row is already gone by the time `hooks.after` runs (**note, superseded**: these were bare global `Map`s until the post-PR round replaced all three with `RequestSnapshots<T>`).
9. **`SSO_ENFORCEMENT_CHANGED` is the one event of the 13 not routed through a plugin endpoint** — it's emitted by `AdminActionService.setSsoEnforcement`, not a `hooks.after` path branch, because the enforcement toggle (deviation 5 above) is a bespoke route, not part of either plugin.
10. **R11 — the local Keycloak Docker profile moved from this task (originally its own step) into Task 1.** Task 6's live-IdP verification and this task's Step 4 round-trip both need a running Keycloak; rather than have Task 6 stub it or reorder the plan, the `sso` opt-in profile in `docker-compose.yaml` shipped with Task 1 and stayed untouched here.
11. **Two `createSession` call sites outside the enforcement hook's reach are a known, accepted gap** — flagged and accepted rather than fixed in this phase; they don't participate in the four enforced sign-in paths and are out of scope for SSO enforcement specifically, but are noted here so a future security pass doesn't have to rediscover them.

**Local development** — `docs/SSO-LOCAL.md` documents the full Keycloak setup (realm, OIDC client, SAML client) and two traps discovered only by actually running the round-trip: (a) `@better-auth/sso`'s `samlConfig.issuer` field doubles as the **SP's own entity ID** used both to sign the outgoing `AuthnRequest` and to validate it against the IdP's registered client — the **IdP's** real issuer has to go in `samlConfig.idpMetadata.entityID` instead, or every assertion fails `ERR_UNMATCH_ISSUER`; (b) the SSO plugin validates an OIDC discovery URL's origin against the auth server's own `trustedOrigins` (`CORS_ORIGIN`) — a local, non-TLS Keycloak has to be added to that allowlist for local testing only, never in a deployed environment.

**Verification performed for this task (Step 4), and what was not exercised live**:

- **OIDC round-trip**: full browser-equivalent flow against a local Keycloak realm — `/sign-in/sso` → authorization URL → Keycloak login → `/sso/callback/<providerId>` → session cookie issued, `member` row created in the target org (JIT provisioning, `role: "member"`). Confirmed live.
- **SAML round-trip**: same, through the SP-initiated `AuthnRequest` → Keycloak SAML login → `POST` to `/sso/saml2/sp/acs/<providerId>` → session issued, `member` row created. Confirmed live, after working through the two traps above.
- **SCIM lifecycle**: `POST` (create) → `GET` → `PATCH` (deactivate, `active: false`) → `PUT` (update, non-active fields) → `DELETE` (deprovision) all exercised against `/scim/v2/Users`, plus `POST /scim/generate-token` and `POST /scim/delete-provider-connection`. Confirmed live, including the D9 org-departure behavior (member row gone, user row intact).
- **All four enforced sign-in paths**: `/sign-in/email`, `/sign-up/email`, and `/sign-in/magic-link` were exercised live against an SSO-enforced domain and each returned `403 { message: "SSO_REQUIRED", providerId }`. The **passkey leg was verified live too, through the shared hook rather than a WebAuthn ceremony**: `databaseHooks.session.create.before` is the single hook every session-creation path funnels through (the three above never reach it, since they're already blocked earlier), so triggering it via `/magic-link/verify` for a user who was sent a link *before* enforcement turned on — then verified *after* — exercises the identical hook and the identical better-call serialization pipeline the passkey path uses. It returned the raw, unwrapped body `{"message":"SSO_REQUIRED","providerId":"keycloak-test-com"}`, confirming `providerId` reaches the client on that leg too (see the R30 fix below — it didn't, until this round). A real WebAuthn ceremony remains out of reach in this curl-only environment.
- **Event catalog**: 12 of the 13 `sso.*`/`scim.*` event types were confirmed live via `outbox_event` rows. **`sso.domain.verified` (1 of 13) was not exercised live** — the real endpoint (`/sso/verify-domain`) performs a DNS TXT lookup, which cannot succeed against a domain this environment doesn't control; `domainVerified` was set directly in the database to unblock the OIDC/SAML round-trips instead. The event's emit site was confirmed present by code inspection (`auth.ts`, `hooks.after` on `SSO_PATHS.verifyDomain`) but not exercised end-to-end.

### Fix round 1 (post-initial delivery)

1. **R30 — the passkey leg's `SSO_REQUIRED` rejection was missing `providerId`.** `databaseHooks.session.create.before` had already resolved `enforced.unwrap()` before throwing, but the throw itself only set `message`, unlike the three email-bearing paths in `hooks.before`. A client forced to special-case one path out of four to recover the provider was the actual defect — fixed by adding the field, not by documenting the inconsistency. Verified live via the `/magic-link/verify` route (see above), since it shares the exact hook and the exact serialization path the passkey leg uses.
2. **R31 — the SSO-redirect-on-`SSO_REQUIRED` behavior only existed on `use-sign-in.ts`.** `use-sign-up.ts` and `use-magic-link.ts` surfaced the raw `"SSO_REQUIRED"` string as an error toast — a dead end for two of the three server-enforced entry points a real user can hit before ever reaching a password field. The redirect logic (call `authClient.signIn.sso({ providerId, callbackURL })`, throw a sentinel so `onError` skips the toast) was extracted into `redirectToSsoIfRequired` in `apps/app/src/features/auth/auth-error.ts` — the file already shared by all three hooks for `resolveAuthError` — and all three call sites now use it. Unit-tested for the branch that never touches the network (no rejection, or a rejection missing `providerId`); the network-calling branch is integration-verified live the same way as the rest of Step 4.
3. **R32 — the "dark › sso settings" a11y failure was a genuine, reproducible flake, not a rendering bug, and not a phantom.** Root cause: every authenticated-page a11y test shares one seeded identity (`auth.setup.ts`), and the API's global rate limit is keyed **per-user**, not per browser context (`GLOBAL_POLICY`, 60 req/min) — so parallel Playwright workers loading pages as the same identity turn into one shared request bucket. `/settings/sso` fires the most queries per load of any audited page (providers, domain verification token, SCIM connections, entitlements), making it the first to trip that ceiling. The failure's actual page snapshot showed a "Too many requests" toast and the app's global error boundary — confirming it, not a dark-theme defect. Reproduced against a genuinely fresh build (the a11y suite's real failure mode discovered along the way: `pnpm --filter app check:a11y` run directly serves a **stale `vite preview` build**, since only `turbo run check:a11y` honors the pipeline's `dependsOn: ["build"]` — the README already warned about this and it was missed once here), cleared entirely at `--workers=1`, and made deterministic by pinning `workers: 4` in `a11y/playwright.config.ts` instead of leaving Playwright's host-core-count-dependent default in place. Confirmed clean across four consecutive fresh-build runs after the fix.
4. **[Minor] The keyboard tab-order test never reached the new SSO control.** `apps/app/a11y/interaction.spec.ts` covered Email → Password → Remember me → Sign in only. A new test reaches the "Sign in with SSO" trigger, activates it with Space, and asserts the very next Tab stop is the field it revealed — the exact case a rule engine (axe) cannot check on its own.
5. **R33 — two more "what ships" docs still described C.7 as unbuilt.** `docs/OVERVIEW.md` (`## What's next`) and `docs/MODULES.md` (Roadmap modules table + subtotal) both still framed SSO/SCIM as the remaining feature. Both are named in the root `CLAUDE.md` inventory, so a reader following either would be misled about the phase this task closes. `OVERVIEW.md` gets its own shipped-feature section (matching every other shipped capability's treatment); `MODULES.md`'s C.7 row moves from the Roadmap table to the Shipped table, with both subtotals recomputed (total unchanged: **€51 900 – €86 800**, only redistributed).

**Note on the "pre-existing palette flake" recorded during fix round 1**: it was neither pre-existing nor a separate defect. `interaction.spec.ts`'s "traps focus inside the command palette" fails because `/dashboard` bounces to `/sign-in` when its session request is rate-limited, and `Ctrl+K` then has no palette to open. Same root cause as R32, wrongly diagnosed there — see fix round 2 item 4 below.

### Fix round 2 (final whole-branch review, pre-merge)

1. **R35 — SCIM provisioning bypassed the seat cap and emitted no membership event.** `@better-auth/scim` writes the `member` row with a raw `ctx.context.adapter.create({ model: "member" })`, so neither `beforeAddMember` nor `beforeAcceptInvitation` — the two authoritative seat gates — nor `afterAddMember` ever fires on `POST /scim/v2/Users`. Combined with `/scim/generate-token` carrying no tier gate at all (only `/sso/register` had one), a Free-tier owner could mint a SCIM token and provision past `maxMembers` with no billing enforcement, no audit row and no webhook delivery. Three fixes, all in `hooks.before`/`hooks.after`: `/scim/generate-token` now goes through `assertSsoEntitlementFor` — the same helper `/sso/register` uses, extracted on this second occurrence rather than duplicated; `POST /scim/v2/Users` counts members against the plan cap before the endpoint runs (an after-hook cannot cap anything — the row is already written); and `org.member.joined` is emitted from the SCIM after-hook with the provisioned user as subject and the connection owner as actor. **The removal half of the finding was wrong and was not implemented as briefed**: `@better-auth/scim` *does* call `afterRemoveMember` after its own delete transaction (verified in `@better-auth/scim@1.6.29` dist), so `org.member.removed` was already being emitted — adding a second emit would have produced duplicate audit rows and duplicate webhook deliveries. What was actually broken there is the **actor**: the organization plugin passes the *removed* user as `user` on every path, so the event named the deprovisioned user as its own actor. Fixed with a `hooks.before` snapshot (`scimDeprovisionActors`, same read-before-write pattern as the existing provider snapshots) that `afterRemoveMember` prefers over the plugin's argument.
2. **R34 — the passkey enforcement leg was disabled for exactly the users it protects, and the proposed fix was rejected.** The guard skipped enforcement whenever `findLatestLinkedAccount` returned an account belonging to a registered SSO provider. Since an SSO sign-in creates such an account permanently, a user who had signed in through the IdP once was waved through on *every* later path — passkey included — which is the deprovisioning guarantee SSO enforcement is sold on. The review proposed widening the lookup to "does ANY account match a registered `sso_provider`"; that is strictly *more* permissive and leaves the scenario failing identically, so it was not implemented. **The discriminator has to be the request, never the user**: BetterAuth passes the endpoint context as the second argument of `databaseHooks.session.create.before` (`createWithHooks` → `getCurrentAuthContext()`), and its `path` is the endpoint's own registered path — so the four SSO callback paths are identifiable and everything else is enforced. `/admin/impersonate-user` is exempt for a different reason: that session is minted for a platform admin who already passed the admin gate, not by the enforced user authenticating. Proven live by A/B: for a user who already owns an SSO account on an enforced domain, the pre-fix build returned `302` (session issued) on a non-SSO session-creation path and the post-fix build returns `403 {"message":"SSO_REQUIRED","providerId":"keycloak-test-com"}`. That `context.path` is populated and carries the endpoint's registered form was confirmed live too (a probe read `/sign-in/email` out of the hook); the four exempt strings were matched against the plugin's own `createAuthEndpoint` registrations.
3. **The passkey leg's front-end redirect existed only in the docs.** `redirectToSsoIfRequired` was wired into `use-sign-in`, `use-sign-up` and `use-magic-link` but not `use-sign-in-passkey` (raw `SSO_REQUIRED` toast) nor `use-passkey-autofill` (silent no-op), while `docs/MODULES.md` claimed all four paths redirect. Wired rather than downgrading the doc: the passkey leg is server-enforced like the other three, so it gets the same treatment; the autofill leg redirects without a toast, since conditional UI must stay silent on every *expected* failure but an enforced domain is not one.
4. **The `check:a11y` gate was reproducibly red, and the rationale shipped with it named the wrong bucket.** `playwright.config.ts` and `a11y/README.md` both blamed the per-user rate-limit bucket and the worker count. Measured: the bucket that overflows is the **IP**-keyed one (`global:60:global:::1` at 61 against a 60/min ceiling, twice in a row) while the per-user bucket sat at 39 — because `sessionMiddleware` nulls the user for `/api/auth/*`, so a signed-in page's session and organization queries are counted against the IP alongside every unauthenticated page load. Worker count bounds neither: the ceiling is per minute over the whole run and the IP is the same from every worker. The real defect is the tuning: a signed-in page view fires up to 8 API calls (measured), so a 60/min burst window allowed ~7 navigations per minute before a legitimate user got a 429. `GLOBAL_POLICY`'s minute window is now 300 — the hour window (1800, the actual sustained anti-abuse ceiling) is unchanged, and every credential path keeps its own far tighter fail-closed policy. Gate green three consecutive `--force` runs, 21/21.
5. **`sso.login.failure` was public but undeliverable.** It was emitted with no `organizationId` although the provider row carrying one had already been loaded one line above, and `WebhookFanoutSubscriber` drops any event whose `organizationId` is none before it even reads the visibility map — so the one signal telling a customer their IdP broke reached nobody and was absent from their audit view. One argument added at the emit; verified live (new `outbox_event` row carries the org id where the two pre-fix rows carry `NULL`).

**Verification for this round** — live: the SCIM entitlement gate (403 `SSO_ORGANIZATION_REQUIRED` / `SSO_PLAN_REQUIRED` / falls through to the endpoint on a Business org), the SCIM seat cap (402 `Seat limit reached (3).` on a Free-tier org at 5 members), `org.member.joined` and `org.member.removed` emitted with the connection owner as actor and the provisioned user as subject, the enforcement A/B above, `sso.login.failure` carrying its org id, and three consecutive green `check:a11y` runs. Established by reading, not exercised live: the SSO callback's own session creation still passing the guard (no IdP round-trip was run this round — the exempt path strings were matched against the plugin's endpoint registrations and `context.path` was confirmed populated with that exact form), and the passkey/autofill front-end redirect (a real WebAuthn ceremony remains out of reach here, same limitation as fix round 1).

**Accepted, documented gaps left by this round**:

- **The SCIM seat cap is a pre-endpoint count, not a transactional reservation.** Two concurrent `POST /scim/v2/Users` can both pass the check and land one seat over. Same race the invitation-accept gate has, same accepted trade-off.
- **`organizationHooks.afterAddMember`/`afterRemoveMember` misattribute the actor on every non-SCIM path too.** The organization plugin passes the added/removed *user* as `user`, so `org.member.joined`'s `actorUserId` is always `undefined` (the `user.id !== member.userId` test can never be true) and `org.member.removed` names the removed member as its own actor. This pre-dates C.7 and affects the ordinary invite/kick flows; only the SCIM path is corrected here, because only there was an actor recoverable without a new mechanism. A proper fix needs an ambient actor at the hook level and deserves its own pass.
- **Every `/api/auth/*` request is rate-limited by IP, even for signed-in users**, because `sessionMiddleware` deliberately skips the session lookup on those paths. Two signed-in users behind one NAT therefore share a bucket for their BetterAuth traffic (session + organization queries, ~4 calls per navigation). The burst-window retune above mitigates it; keying those requests per user would cost a session lookup on the hottest endpoint of the app and was judged out of scope for a fix round.

### Post-PR security review (pre-merge)

A security-focused review of the whole branch was run after the PR was opened and blocked the merge with two Criticals. Both held, so the merge waited — the instruction standing at the time was "merge if everything is OK", and it wasn't.

1. **A stranded SCIM snapshot could forge the actor on an unrelated kick.** `scimDeprovisionActors` was a global `Map` keyed on a bare `userId`, written unconditionally in `hooks.before` and consumed only by `afterRemoveMember` — a hook that never fires when the SCIM `DELETE` 404s or the target holds no member row. The stranded entry then poisoned the *next* removal of that user, by any admin, in any org, naming the SCIM connection owner as the actor: audit-trail forgery on `org.member.removed`. Fixed by introducing `RequestSnapshots<T>` (`apps/api/src/shared/auth/request-snapshots.ts`) — a keyed store with a freshness TTL bounding how long a stranded entry stays pickable, plus a consumer-supplied `accepts()` predicate — and routing all three before/after snapshot maps through it. The deprovision snapshot now carries `{ actorUserId, organizationId }` and its consumer requires an organization match; a non-matching entry is left in place rather than deleted, since it may belong to a request still in flight. Reproduced live before the fix and confirmed gone after. The same commit rewrote the seat-cap docblock (it claimed to reuse `assertSeatAvailableFor` when it inlined the check, because that helper throws `AppErrorException` and SCIM needs an `APIError`; `seatCapFor()` is now the shared predicate both callers use) and gave SCIM refusals an RFC 7644 error body (`urn:ietf:params:scim:api:messages:2.0:Error`), which is what Okta and Entra expect.
2. **`/api/auth/send-verification-email` had no dedicated rate-limit policy.** It is a public `POST` taking an arbitrary email with no session — the same "make the server email a stranger" primitive as `request-password-reset` and `sign-in/magic-link`, both of which carry a fail-closed 3/15min policy. It only inherited the global window, which fix round 2 had just widened from 60 to 300/min for legitimate navigation traffic — so the retune quietly loosened it fivefold. Given the same policy as its siblings, mounted in the same guard block ahead of the global limiter.
3. **Critical — SAML hardening applied at registration but not on update.** `normalizeSamlConfig` ran only on `/sso/register`. An org admin could register a compliant SAML provider, then `PATCH /sso/update-provider` with `{ wantAssertionsSigned: false, signatureAlgorithm: "sha1" }` — and `samlify` derives `wantMessageSigned` from that flag, so assertions stopped requiring a signature at all. The normalizer is now applied on the update path too; it was already written spread-based and partial-update-safe (identity fields pass through only when sent, the four security fields are always forced strong), so the fix is the call site plus tests for the partial-update shape.
4. **Critical — the SCIM `hooks.before` branches trusted an unverified bearer token.** They decoded the `Authorization` header, took the `providerId` out of it, and resolved the connection row with `scimConnectionOwner` — with no hash check. `runBeforeHooks` executes **before** an endpoint's own `use: [sessionMiddleware]` bearer auth, and `providerId` is a deterministic slug of the org's domain, so an unauthenticated caller with a guessed id got two primitives: a pre-auth cross-tenant billing oracle (a `402` leaking `maxMembers` versus a `401`), and a same-org audit-forgery primitive — fix (1)'s organization-match guard had closed only the cross-org case. Fixed with `verifiedScimConnectionOwner` in `auth-queries.ts`: it hashes the decoded token with the exact algorithm the `storeSCIMToken: "hashed"` mount uses (`SHA-256` → base64url, unpadded — the plugin exports no hasher, so it is reimplemented with a docblock tying it to that mount option) and constant-time-compares it against the stored value. Any `hooks.before` branch needing the connection owner must use it; on a missing, malformed, unknown or non-matching token it returns `null` and the branch falls through to the endpoint's own `401` rather than acting on unverified input. The seat cap simply isn't evaluated for such a request, which is correct: it `401`s before any member row is written.

**Merged** after this round: PR #61 into `dev` as a merge commit, all gates green (718 api tests, 147 app tests, type-check 12/12, Biome clean, knip clean, jscpd 28 clones, a11y 21/21).

**Gaps this phase never closed, carried forward**: `sso.domain.verified` is still never exercised live (it needs DNS TXT control over a real domain); no real WebAuthn ceremony has been driven; the SSO-callback success path after the final enforcement change rests on construction plus a probe rather than a Keycloak round-trip; `enforcedProviderForDomain` and the `auth.ts` wiring have no automated coverage, since the repo has no real-DB test harness; the a11y suite stays coupled to an IP-keyed rate limit; SAML SLO is declared but unwired; and there is no operator runbook for recovering an org that locks itself out with enforcement.

## Toolchain — Postgres 18 ✅ Phase G.1c · Aug 2026

Dev compose, the CI service image, both README mentions and `docs/DISASTER-RECOVERY.md`'s three runnable examples move from `postgres:17-alpine` to `postgres:18-alpine`. `docs/DEPLOY-RAILWAY.md` turned out to pin no version at all — it runs `railway add --database postgres-ssl` and lets Railway pick — so it gains an explicit minimum instead of a version bump.

**Undocumented breaking change discovered while recreating the dev volume**: the `postgres:18-alpine` image refuses to start against a bind mount at `/var/lib/postgresql/data` — the 18+ images store data one directory up, at `/var/lib/postgresql/<major>/docker`, to align with `pg_ctlcluster`-style layouts. `docker-compose.yaml`'s `postgres` service now mounts the named volume at `/var/lib/postgresql` (was `/var/lib/postgresql/data`); without this the container loops in `Restarting` with `Error: in 18+, these Docker images are configured to store database data in a format which is compatible with "pg_ctlcluster"...`. Neither the task brief nor the ROADMAP entry that scoped this work anticipated this — it's a genuine image-level change, not something to have caught by reading `docker-compose.yaml` alone.

**Action required for anyone with a pre-existing `postgres_data` volume**: the mount-path move above is silent, not loud, for a volume populated under the old layout. `docker compose up` won't crash the way a brand-new empty volume did during this task — Postgres 18 will find nothing at the new `/var/lib/postgresql` mount point (the old data sits one level down, at the now-unmounted `/var/lib/postgresql/data`) and will just initialize a fresh, empty database with no error. That's a silent dev-data loss, not a visible failure. Run `docker volume rm clean-stack_postgres_data` once before the first `up` on a checkout that already ran `docker compose up postgres` pre-bump, then rebuild with `pnpm db:push && pnpm db:seed`. Documented in `README.md`'s Database section (the `Volume` row + the callout above the `db:*` script block) as the place a reader would hit this before losing data rather than after.

Primary keys stay `text`: every PK in `packages/drizzle/src/schema/` is filled by BetterAuth, which generates its own ids, so `uuidv7()` is a BetterAuth question rather than a Postgres one. It's documented in `docs/MODULES.md` as the shape for new cloner-owned tables instead.

### Before/after query plans

The payoff of 18 here is operational (async I/O, B-tree skip scan), so the two hot paths that touch the outbox were `EXPLAIN (ANALYZE, BUFFERS)`'d before the bump (Postgres 17.x, `docker compose exec postgres psql`) and again after (Postgres 18.6-alpine, same commands, dev DB recreated from scratch per the brief since a major version doesn't read the previous major's data directory).

**1. Outbox drain** — mirrors `apps/api/src/shared/services/drizzle-outbox.service.ts:95-108`, which reads `outbox_event_pending_idx` (`packages/drizzle/src/schema/outbox.ts:30`):

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM outbox_event
WHERE dispatched_at IS NULL
  AND (next_attempt_at IS NULL OR next_attempt_at <= now())
ORDER BY occurred_at
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

Postgres 17 (0 pending rows at capture time — dev DB had already drained the seeded events):

```
Limit  (cost=8.15..8.17 rows=1 width=582) (actual time=0.024..0.025 rows=0 loops=1)
  Buffers: shared hit=4
  ->  LockRows  (cost=8.15..8.17 rows=1 width=582) (actual time=0.023..0.024 rows=0 loops=1)
        Buffers: shared hit=4
        ->  Sort  (cost=8.15..8.16 rows=1 width=582) (actual time=0.023..0.023 rows=0 loops=1)
              Sort Key: occurred_at
              Sort Method: quicksort  Memory: 25kB
              Buffers: shared hit=4
              ->  Index Scan using outbox_event_pending_idx on outbox_event  (cost=0.12..8.14 rows=1 width=582) (actual time=0.006..0.006 rows=0 loops=1)
                    Filter: ((dispatched_at IS NULL) AND ((next_attempt_at IS NULL) OR (next_attempt_at <= now())))
                    Buffers: shared hit=1
Planning:
  Buffers: shared hit=197
Planning Time: 0.662 ms
Execution Time: 0.075 ms
```

Postgres 18.6 (5 pending rows — fresh seed, dispatcher not yet run):

```
Limit  (cost=8.17..8.19 rows=1 width=290) (actual time=0.040..0.043 rows=5.00 loops=1)
  Buffers: shared hit=10
  ->  LockRows  (cost=8.17..8.19 rows=1 width=290) (actual time=0.039..0.041 rows=5.00 loops=1)
        Buffers: shared hit=10
        ->  Sort  (cost=8.17..8.18 rows=1 width=290) (actual time=0.028..0.029 rows=5.00 loops=1)
              Sort Key: occurred_at
              Sort Method: quicksort  Memory: 27kB
              Buffers: shared hit=5
              ->  Index Scan using outbox_event_pending_idx on outbox_event  (cost=0.14..8.16 rows=1 width=290) (actual time=0.009..0.011 rows=5.00 loops=1)
                    Filter: ((dispatched_at IS NULL) AND ((next_attempt_at IS NULL) OR (next_attempt_at <= now())))
                    Index Searches: 1
                    Buffers: shared hit=2
Planning:
  Buffers: shared hit=161
Planning Time: 0.553 ms
Execution Time: 0.079 ms
```

**Access path unchanged**: both plans drive the drain through `Index Scan using outbox_event_pending_idx`, wrapped in the same `LockRows`/`Sort`/`Limit` shape — no fallback to a sequential scan. The only textual diff is Postgres 18 printing a new `Index Searches: 1` line under each index node (a genuine 18 addition to `EXPLAIN`'s index-scan output, not a plan change) and the row counts differing because the two captures ran against different data volumes (see caveat below). This is the query that matters most for this bump — confirmed stable.

**2. Notification fan-out** — the `INSERT … SELECT` at `apps/api/src/shared/services/notification-fanout-subscriber.ts:103-132`, captured by instrumenting a `CapturingInstrumentation` that records the span name the code already builds for `query.getQuery().sql` (the same value the production Sentry span carries), driving it with a real `org.member.invited` event inside a rolled-back transaction against the seeded dev user/org, then re-running the captured SQL + params through `EXPLAIN (ANALYZE, BUFFERS)` in a second rolled-back transaction (`pg.Pool`, `BEGIN`/`ROLLBACK` bracketing — no data mutated in either DB).

Postgres 17 (org with 12 members across the accumulated 11h-old dev dataset):

```
Insert on notification  (cost=0.59..34.02 rows=0 width=0) (actual time=0.078..0.078 rows=0 loops=1)
  Conflict Resolution: NOTHING
  Conflict Arbiter Indexes: notification_dedup_uidx
  Tuples Inserted: 1
  Conflicting Tuples: 0
  Buffers: shared hit=20
  ->  Subquery Scan on "*SELECT*"  (cost=0.59..34.02 rows=1 width=283) (actual time=0.031..0.033 rows=1 loops=1)
        Buffers: shared hit=9
        ->  Nested Loop Left Join  (cost=0.59..34.00 rows=1 width=259) (actual time=0.030..0.031 rows=1 loops=1)
              Buffers: shared hit=9
              ->  Nested Loop Left Join  (cost=0.44..25.81 rows=1 width=28) (actual time=0.018..0.020 rows=1 loops=1)
                    Join Filter: (up_mail.scope_id = member.user_id)
                    Buffers: shared hit=7
                    ->  Nested Loop Left Join  (cost=0.29..17.62 rows=1 width=27) (actual time=0.015..0.016 rows=1 loops=1)
                          Filter: COALESCE(CASE WHEN op_app.locked THEN op_app.enabled ELSE NULL::boolean END, up_app.enabled, op_app.enabled, true)
                          Buffers: shared hit=5
                          ->  Nested Loop Left Join  (cost=0.15..9.44 rows=1 width=28) (actual time=0.011..0.012 rows=1 loops=1)
                                Join Filter: (up_app.scope_id = member.user_id)
                                Buffers: shared hit=3
                                ->  Seq Scan on member  (cost=0.00..1.24 rows=1 width=27) (actual time=0.006..0.007 rows=1 loops=1)
                                      Filter: ((role = ANY ('{owner,admin}'::text[])) AND (organization_id = 'cd51d944-2022-4038-b6ce-064af9a5be4e'::text))
                                      Rows Removed by Filter: 11
                                      Buffers: shared hit=1
                                ->  Index Scan using notification_preference_uidx on notification_preference up_app  (cost=0.15..8.18 rows=1 width=33) (actual time=0.004..0.004 rows=0 loops=1)
                                      Index Cond: ((scope = 'user'::text) AND (category = 'org'::text) AND (channel = 'in_app'::text))
                                      Buffers: shared hit=2
                          ->  Index Scan using notification_preference_uidx on notification_preference op_app  (cost=0.15..8.17 rows=1 width=2) (actual time=0.003..0.003 rows=0 loops=1)
                                Index Cond: ((scope = 'org'::text) AND (scope_id = 'cd51d944-2022-4038-b6ce-064af9a5be4e'::text) AND (category = 'org'::text) AND (channel = 'in_app'::text))
                                Buffers: shared hit=2
                    ->  Index Scan using notification_preference_uidx on notification_preference up_mail  (cost=0.15..8.18 rows=1 width=33) (actual time=0.003..0.003 rows=0 loops=1)
                          Index Cond: ((scope = 'user'::text) AND (category = 'org'::text) AND (channel = 'email'::text))
                          Buffers: shared hit=2
              ->  Index Scan using notification_preference_uidx on notification_preference op_mail  (cost=0.15..8.17 rows=1 width=2) (actual time=0.004..0.004 rows=0 loops=1)
                    Index Cond: ((scope = 'org'::text) AND (scope_id = 'cd51d944-2022-4038-b6ce-064af9a5be4e'::text) AND (category = 'org'::text) AND (channel = 'email'::text))
                    Buffers: shared hit=2
Planning:
  Buffers: shared hit=359
Planning Time: 0.895 ms
Trigger for constraint notification_user_id_user_id_fk: time=0.253 calls=1
Trigger for constraint notification_organization_id_organization_id_fk: time=0.194 calls=1
Trigger notification_notify_trigger: time=0.293 calls=1
Execution Time: 0.874 ms
```

Postgres 18.6 (org with 1 member — freshly reseeded dev volume, per Step 6):

```
Insert on notification  (cost=4.75..42.29 rows=0 width=0) (actual time=0.117..0.118 rows=0.00 loops=1)
  Conflict Resolution: NOTHING
  Conflict Arbiter Indexes: notification_dedup_uidx
  Tuples Inserted: 1
  Conflicting Tuples: 0
  Buffers: shared hit=22
  ->  Subquery Scan on "*SELECT*"  (cost=4.75..42.29 rows=1 width=288) (actual time=0.056..0.057 rows=1.00 loops=1)
        Buffers: shared hit=12
        ->  Nested Loop Left Join  (cost=4.75..42.27 rows=1 width=264) (actual time=0.051..0.052 rows=1.00 loops=1)
              Buffers: shared hit=12
              ->  Nested Loop Left Join  (cost=4.61..34.08 rows=1 width=33) (actual time=0.041..0.042 rows=1.00 loops=1)
                    Join Filter: (up_mail.scope_id = member.user_id)
                    Buffers: shared hit=10
                    ->  Nested Loop Left Join  (cost=4.46..25.89 rows=1 width=32) (actual time=0.035..0.036 rows=1.00 loops=1)
                          Filter: COALESCE(CASE WHEN op_app.locked THEN op_app.enabled ELSE NULL::boolean END, up_app.enabled, op_app.enabled, true)
                          Buffers: shared hit=8
                          ->  Nested Loop Left Join  (cost=4.31..17.70 rows=1 width=33) (actual time=0.029..0.030 rows=1.00 loops=1)
                                Join Filter: (up_app.scope_id = member.user_id)
                                Buffers: shared hit=6
                                ->  Bitmap Heap Scan on member  (cost=4.16..9.51 rows=1 width=32) (actual time=0.012..0.012 rows=1.00 loops=1)
                                      Recheck Cond: (organization_id = 'a1c087a7-9e0d-4f94-a509-6545adfcebdb'::text)
                                      Filter: (role = ANY ('{owner,admin}'::text[]))
                                      Heap Blocks: exact=1
                                      Buffers: shared hit=2
                                      ->  Bitmap Index Scan on "member_organizationId_idx"  (cost=0.00..4.16 rows=2 width=0) (actual time=0.005..0.006 rows=1.00 loops=1)
                                            Index Cond: (organization_id = 'a1c087a7-9e0d-4f94-a509-6545adfcebdb'::text)
                                            Index Searches: 1
                                            Buffers: shared hit=1
                                ->  Index Scan using notification_preference_uidx on notification_preference up_app  (cost=0.15..8.18 rows=1 width=33) (actual time=0.016..0.016 rows=0.00 loops=1)
                                      Index Cond: ((scope = 'user'::text) AND (category = 'org'::text) AND (channel = 'in_app'::text))
                                      Index Searches: 1
                                      Buffers: shared hit=4
                          ->  Index Scan using notification_preference_uidx on notification_preference op_app  (cost=0.15..8.17 rows=1 width=2) (actual time=0.005..0.005 rows=0.00 loops=1)
                                Index Cond: ((scope = 'org'::text) AND (scope_id = 'a1c087a7-9e0d-4f94-a509-6545adfcebdb'::text) AND (category = 'org'::text) AND (channel = 'in_app'::text))
                                Index Searches: 1
                                Buffers: shared hit=2
                    ->  Index Scan using notification_preference_uidx on notification_preference up_mail  (cost=0.15..8.18 rows=1 width=33) (actual time=0.006..0.006 rows=0.00 loops=1)
                          Index Cond: ((scope = 'user'::text) AND (category = 'org'::text) AND (channel = 'email'::text))
                          Index Searches: 1
                          Buffers: shared hit=2
              ->  Index Scan using notification_preference_uidx on notification_preference op_mail  (cost=0.15..8.17 rows=1 width=2) (actual time=0.004..0.004 rows=0.00 loops=1)
                    Index Cond: ((scope = 'org'::text) AND (scope_id = 'a1c087a7-9e0d-4f94-a509-6545adfcebdb'::text) AND (category = 'org'::text) AND (channel = 'email'::text))
                    Index Searches: 1
                    Buffers: shared hit=2
Planning:
  Buffers: shared hit=348
Planning Time: 1.250 ms
Trigger for constraint notification_user_id_user_id_fk: time=0.406 calls=1
Trigger for constraint notification_organization_id_organization_id_fk: time=0.248 calls=1
Execution Time: 0.855 ms
```

**Access path partly changed, and it's not a clean read on Postgres 18 alone**: the four `notification_preference` lookups (`up_app`/`op_app`/`up_mail`/`op_mail`) stayed `Index Scan using notification_preference_uidx` on both versions. The `member` lookup did change shape — `Seq Scan on member` (17) vs `Bitmap Heap Scan` through `member_organizationId_idx` (18) — **but the two captures ran against different data volumes**: the 17 capture reused an 11-hour-old dev DB with 12 accumulated member rows across several orgs, while the 18 capture ran against the freshly reseeded, single-org, single-member DB the brief's Step 6 requires (`docker volume rm` + `db:push && db:seed`). A `member` table with 1 row choosing an index path over a seq scan is exactly the kind of small-table plan choice that's sensitive to `ANALYZE` timing right after a fresh seed, not evidence of a genuine Postgres 18 planner regression — the estimated costs (`4.16..9.51` for the bitmap path) are still tiny in absolute terms. Re-running both captures against matched row counts, on the same major, is the only way to attribute this cleanly to the version bump rather than to dataset drift; it wasn't repeated here because the outbox-drain query is the one the brief calls the primary signal, and that one is unambiguous. Recorded here rather than silently dropped, per the instruction that an unexplained plan change is the thing this step exists to catch.
