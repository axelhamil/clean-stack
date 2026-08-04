# Features

Inventory of what ships in `clean-stack`. Everything below is wired, tested, and used in the codebase — clone, configure env, ship business logic.

This is the file-level inventory — dense, path-anchored, meant for developers reading the codebase. For a plain-language guided tour of the same features, see [`OVERVIEW.md`](./OVERVIEW.md). For the as-built rationale (decisions, alternatives ruled out, security notes), see [`HISTORY.md`](./HISTORY.md). For what's planned, see [`../ROADMAP.md`](../ROADMAP.md).

---

## Privacy policy / Terms versioning ✅ Phase A.2

RGPD Art. 7 demonstrability — records which version each user accepted and when. Foundation for A.4 (consent stamps the policy version) and A.5 (privacy dashboard shows acceptance history).

**Shared SSOT** (`@packages/policies`): `POLICY_TYPES`, `POLICY_VERSIONS` (both currently `"2026-01-15"`), `POLICY_CHANGELOG`. Source-only package imported by api, app, and `@packages/drizzle`. Bump a version string here → all users re-prompted automatically.

**DB** (`packages/drizzle/src/schema/policies.ts`): append-only `policy_acceptance` table — `userId, policyType, policyVersion, ipAddress, acceptedAt`. Index on `(userId, policyType, acceptedAt DESC)` for fast gate lookups. Durable 7-year trail lives in `audit_log` via the compliance event.

**Backend module** (`apps/api/src/modules/policies/`): compliance infra, not DDD.
- `PolicyAcceptanceService` — `accept` writes N rows + emits N `user.policy.accepted` events in one `uow.run` TX. `getStaleTypes` is the gate predicate.
- Routes: `POST /me/policies/accept` (body `{ types?: PolicyType[] }` — omit to accept all stale), `GET /me/policies`.
- `requireCurrentPolicies` middleware (`shared/middleware/policy.middleware.ts`) — returns 409 when any policy is stale. **Composable, not mounted globally** — the `_shell` redirect is the live enforcement; this is opt-in defense-in-depth for future business routes.

**Sign-up acceptance**: recorded server-side at the BetterAuth `/verify-email` after-hook (idempotent via `getStaleTypes`), not at `/sign-up/email`. Reason: `/sign-up/email` has no session yet and returns a synthetic user on duplicate-email; `/verify-email` has a reliable session `userId`. See [`HISTORY.md`](./HISTORY.md) for the full deviation note.

**Frontend** (`apps/app/src/features/legal/`):
- Sign-up `acceptedPolicies` checkbox (`z.boolean().refine`) linking to the policies via `<PolicyLink>` (new tab, so a misclick doesn't wipe the form).
- Public `/legal/privacy-policy` + `/legal/terms` pages — placeholder content keyed by version, `PolicyDocView` component, `policies.config.tsx` + `getChangesSince` helper.
- Acceptance gate `/legal/accept` (under `_protected`, outside `_shell`) — adapts: first-time user (magic-link/social, no checkbox shown) sees a "Before you get started" welcome; a returning user with a stale version sees the changelog diff. One Accept button. `_shell` `beforeLoad` redirects here when any policy is stale (fail-open if the policies endpoint errors).
- **Hosting-agnostic content**: the full policy text ships in-app as placeholder, but every link resolves `POLICY_URLS` from `@packages/policies`. Hosting the real policies on a marketing site/CMS is a **one-line swap** there (point the URL external, delete the in-app pages) — the versioning + acceptance machinery is untouched.

**Event**: `user.policy.accepted` — self-actor, `compliance` retention.

---

## Cookie consent + Consent management ✅ Phase A.4

CNIL/RGPD Art. 7 ePrivacy — dual-layer device-scoped. `localStorage` seul est insuffisant comme preuve RGPD Art.7§1 (pas horodaté serveur) — le consentement est authoritative côté serveur, le cookie `cc_sid` est le lien device→record.

**Shared SSOT** (`@packages/cookie-consent`): `CONSENT_CATEGORIES` (`["necessary","functional","analytics","marketing"]`), `OPTIONAL_CATEGORIES`, type `ConsentCategory`, `COOKIE_CONSENT_VERSION`, `CONSENT_GRANT_TTL_DAYS=180`, `CONSENT_REFUSAL_TTL_DAYS=180`, `CONSENT_COOKIE_NAME="cc_sid"`. Source-only, miroir de `@packages/policies`.

**DB** (`packages/drizzle/src/schema/consent.ts`): `consent_record(id, subjectId NOT NULL, userId nullable FK user ON DELETE CASCADE, categories jsonb, policyVersion, grantedAt, withdrawnAt nullable, expiresAt, ipAddress, userAgent)` — **append-only** (chaque save = nouveau record, le plus récent gagne). 2 indexes: `(subjectId, expiresAt DESC)` + `(userId, expiresAt DESC)`. Migration `0009_elite_jack_power.sql`. Export `consentSchema` dans le barrel.

**Backend module** (`apps/api/src/modules/consents/`): compliance infra, pas DDD (même classe que `modules/policies/`).
- `IConsentStore` port (module-private) + `DrizzleConsentStore` — §8-instrumenté (outer + inner spans + capture).
- `ConsentService` — `record` (append-only) · `withdraw` · `getActive` (avec **fallback** `subjectId` quand un user connecté n'a pas encore de record) · `reconcile` (link subjectId→userId au login).
- Routes **publiques** `POST /consents` (record, cookie `cc_sid` généré serveur, IP via `resolveClientIp`) · `GET /consents` (état courant) · `DELETE /consents` (withdraw). `optionalAuth` (guest + logged-in). CSRF Origin sur `/consents`. **Rate-limit `CONSENT_POST_POLICY` sur POST/DELETE uniquement** — un GET rate-limité saturait la fenêtre et bloquait l'affichage du banner. Cookie `cc_sid` httpOnly : `secure: isProd`, `sameSite: isProd ? "none" : "lax"`, path `"/"`, pas de prefix `__Host-` (déploiement cross-origin).
- **Réconciliation au login via `hooks.after`** — dans `auth.ts`, si `ctx.context.newSession` existe (= login tous flux confondus : password/passkey/magic-link/2FA/OAuth futur), lit `cc_sid` via `readCookieFromHeaders` et appelle `ConsentService.reconcile` → `UPDATE SET user_id WHERE subject_id = cookie AND user_id IS NULL`. Zéro round-trip client. (`databaseHooks.session.create` n'a **pas** accès aux cookies de requête — vérifié doc BetterAuth.)
- Sweep guests expirés (`apps/api/src/shared/internal-routes/sweep-consents.route.ts`, gate `internalLayers` HMAC) — purge `user_id IS NULL AND expires_at < cutoff`, env `CONSENT_RETENTION_DAYS=365`. Ajouté au runner `cron/sweep.ts`.

**Events**: `user.cookie_consent.granted` + `user.cookie_consent.withdrawn` — payload `{ subjectId, userId?, categories, policyVersion, ipAddress?, userAgent? }`, retention `compliance`. Porte le compteur à **42 events**.

**Frontend** (`apps/app/src/shared/`):
- `api/queries/consent.ts` (`consentQueryOptions`) — état serveur initial, évite le flash-of-banner.
- `api/mutations/record-consent.ts` + `withdraw-consent.ts` — factories `mutationOptions`.
- `hooks/use-consent.ts` (`useConsent(category): boolean`) — hook impératif de vérification.
- `components/cookie-banner.tsx` (`<CookieBanner>`) — symétrie CNIL Reject/Accept (même prominence), `necessary` non-toggleable, auto-monté dans `app-providers.tsx`, caché si consentement courant.
- `components/consent-settings.tsx` (`<ConsentSettings>`) — toggles reflètent l'état réellement consenti (pas de pré-réglage GPC).
- `components/consent-gate.tsx` (`<ConsentGate category>`) — **primitif déclaratif** : rend ses enfants seulement si la catégorie est consentie.
- `components/analytics-scripts.tsx` (`<AnalyticsScripts>`) — **exemple d'usage** : charge le script `VITE_ANALYTICS_SRC` (env optionnel) seulement si `analytics` consenti, cleanup React au retrait.
- `components/legal-footer.tsx` (`<LegalFooter>`) — footer avec liens vers toutes les pages légales, monté dans `AppShell` (users connectés). Source : `shared/legal-routes.ts` (`LEGAL_ROUTES`) extrait de command-palette (DRY, consommé par les deux).
- Page `/legal/cookies` (`features/legal/cookies.{route,page}.tsx` + `cookies.config.ts`) — inventaire des cookies par catégorie (CNIL transparence obligation), route publique sous `rootRoute`.
- `shared/env.ts` : + `VITE_ANALYTICS_SRC` (optionnel).
- **Toast 429 global consolidé** (`observability/query-error-handler.ts`) — `notifyIfRateLimited` affiche un toast unique (message + durée depuis `Retry-After`) sur tout 429 queries ET mutations, dédup par `id`. L'ancien countdown seconde-par-seconde (`rate-limit-toast.ts`) supprimé (inadapté aux durées en minutes/heures).

**Décisions réglementaires (SOTA 2026)**: GPC = aucune valeur légale en EU (CCPA/US uniquement) — conformité assurée par le modèle opt-in. DNT = mort, ignoré. Google Consent Mode v2 = hors scope (pas de produit Google). Symétrie Reject/Accept premier niveau (sanctions CNIL 2025). Durées 180j configurables (CNIL non figée). Référence : recommandation CNIL consolidée janvier 2026.

---

## Compliance docs bundle ✅ Phase A.3

EAA Art. 14 accessibility declaration + GDPR Art. 28 sub-processor disclosure, both mandatory for EU deploys. Static public pages (no auth gate, no backend touched). Contract templates for EU client onboarding. 0 domain events — event count stays at 40.

**Frontend** (`apps/app/src/features/legal/`):
- `/legal/sub-processors` (`sub-processors.{route,page}.tsx`) — 4 Cards: context, Active sub-processors (shadcn Table: Name/Purpose/Region/DPA), Planned sub-processors (same Table), Change-notice (Art. 28 §2, 30-day advance notice + `dpo@[domain]`). Typed config `SUB_PROCESSORS` in `apps/app/src/shared/sub-processors.config.ts` (`SubProcessor { name, purpose, region, category, url?, dpaUrl?, status }`). Relocated from `features/legal/` to `shared/` in A.5 (two consumers: legal page + `DataSourcesCard`). Active: Resend, Cloudflare R2, BetterAuth OAuth. Planned: Stripe, GrowthBook, Umami.
- `/legal/accessibility` (`accessibility.{route,page}.tsx`) — 5 sections (EAA Art. 14): Compliance status (WCAG 2.1 AA / EN 301 549 v3.2.1 target), Known limitations, Technical specifications, Feedback + contact (`accessibility@[domain]`), Enforcement + escalation. Exemplary a11y: single `<h1>`, `<TypographyH2>` section headings, labelled `mailto:`.
- Linked via `router.tsx` (2 public child routes under `rootRoute`), `command-palette.tsx` (2 `LEGAL_ROUTES` entries), `data-rights.page.tsx` (cross-link cards). Footer links deferred (no global footer yet).

**Contract templates** (`docs/legal/`):
- `DPA-template.md` — 12-clause GDPR Art. 28 Data Processing Agreement. Covers sub-processor management (30-day notice), incident notification (72h), data return/deletion on contract end. Placeholders: `[CLIENT_NAME]`, `[EFFECTIVE_DATE]`, `[CLIENT_CONTACT]`, `[DPA_CONTACT]`.
- `DORA-annex-template.md` — 11-provision DORA Art. 30 annex (mandatory for EU fintech/insurance clients since Jan 17 2025). Covers SLA targets (mirrors Phase 0.3 RPO/RTO), audit rights (on-site + remote), incident reporting (NIS2 24h/72h/1-month), exit plan + data portability, sub-contractor chain.
- `README.md` — index + fintech-vs-B2B decision table (fintech → DPA + DORA annex; non-fintech EU B2B → DPA only) + placeholder checklist for production readiness (`accessibility@[domain]`, `dpo@[domain]`, national accessibility authority).

**Clone-ability fix** (`apps/app/src/shared/env.ts`): `VITE_SENTRY_DSN: z.preprocess((v) => (v === "" ? undefined : v), z.url().optional())` — `.env.example` ships the var as an empty string; bare `z.url().optional()` threw on `""` because empty string is not `undefined`. Now boots clean on a fresh `pnpm bootstrap`.

---

## Profile editing + NIST 800-63B-4 password baseline ✅ Phase A.1

GDPR Art. 16 rectification surface + SOTA-2026 password policy, both wired into the existing `/settings/account` page.

**Profile editing** (`features/account/account.page.tsx` — `ProfileCard`):
- Edit display name (max 80 chars) + email (re-verification via BetterAuth `user.changeEmail`, confirmation sent to the **current** address) + avatar (three-step presign→PUT→confirm via `createUploadMutationOptions`, with client-side `image/*` + 5 MB guard).
- Pending email change badge visible until the new address is verified.
- `ChangePasswordCard` — standalone card for password update, below the profile fields. Passkeys/2FA/RecoveryCodes cards remain on `/settings/account` unchanged. `SessionsCard` + `DataExportCard` relocated to `/settings/privacy` in A.5; `RgpdDeletionCard` remains on `/settings/account` as a contextual danger zone.

**Password baseline (NIST SP 800-63B-4)**:
- **Min 15 chars** everywhere (`emailAndPassword.minPasswordLength: 15`). No MFA exception — 15 is universal.
- **No complexity rules** — `strongPasswordSchema` (`shared/auth/auth.schema.ts`) is `min(15).max(128)` only; uppercase/digit/symbol regexes removed. Applied to sign-up + password-reset flows.
- **HIBP breach screening** at sign-up / password-change / reset — k-anonymity SHA-1 prefix (`api.pwnedpasswords.com/range/<sha1[:5]>`, `Add-Padding` header). Port `IPasswordBreachService` + `HibpPasswordBreachService` (`shared/services/`). Timeout configurable via `HIBP_TIMEOUT_MS` (default 3000 ms). **Fail-open** — HIBP outage never blocks auth.
- **Contextual ban-list** (`shared/password-policy.ts`, `findPasswordViolation()`) — bans email local-part, display name, and app name. Zero I/O, pure-compute. Common passwords are left to HIBP (no redundant inline list). The full policy is wrapped in a testable `validatePassword()` (length-guard → ban-list → HIBP); the BetterAuth `hooks.before` is a one-line caller.
- **Field UX (NIST-aligned)** — `FormTextField` ships a show/hide reveal toggle + a per-field hint on every new-password input (sign-up / reset / change). Server policy errors (breach / ban / wrong current password) render inline on the field, not as a toast.
- Validation via `auth.ts` `hooks.before` on `/sign-up/email`, `/reset-password`, `/change-password` (returns `APIError` 422).

## Auth — BetterAuth ✅

End-to-end authentication on Bun + Hono, no hacks.

- **Email + password** with required verification + password reset (forgot-password flow → token via app URL).
- **Magic link** (passwordless email).
- **Passkeys** (`@better-auth/passkey`, WebAuthn) — registered & managed from `/settings/account` (`passkeys-card`, `add-passkey-form`).
- **Two-factor** (TOTP, backup codes) — enable / disable from `/settings/account` (`two-factor-card`, `enable-two-factor-form`, `disable-two-factor-form`). Recovery codes: `RecoveryCodesCard` (regenerate-only, password gate, codes natively formatted `xxxxx-xxxxx` by BetterAuth, copy + download `clean-stack-recovery-codes.txt`). Backup-code fallback on `/two-factor` (input normalization tolerant: whitespace stripped, dash auto-inserted on 10-char input). On-use email via `BackupCodeUsedNotifier` (first `onEvent` handler).
- **Active sessions** — list & revoke from `/settings/privacy` (`sessions-card`, relocated from `/settings/account` in A.5).
- **Bearer tokens** alongside cookies — web stays cookie-based (httpOnly, XSS-safe), Capacitor uses bearer.
- **Session cookie cache** (5 min signature-only check; DB is source of truth at expiry → instant revoke).
- **Cross-tab sync** via `BroadcastChannel` (`shared/auth/auth-broadcast.ts`) — sign-in / sign-out / verify / 2FA / org change refetch live in every tab.
- **Token-consuming routes** outside the auth gate (`/verify-email`, `/reset-password`, `/magic-link`, `/two-factor`, `/accept-invitation/$invitationId`) with StrictMode-safe `useRef` guard against single-use token re-fire.
- **Layout route gates** (`_protected` / `_guest`) inline in `apps/app/src/router.tsx` — auth state read once via `ensureQueryData(sessionQueryOptions)` in `beforeLoad`.

Pages shipped: `sign-in`, `sign-up`, `verify-email`, `forgot-password`, `reset-password`, `magic-link`, `two-factor`.

## Multi-tenant — BetterAuth `organization` plugin ✅

Org-scoped from the very first migration. Migrating single-user → multi-tenant later is hell; the reverse is free.

- **Personal org** auto-created on signup (`ensurePersonalOrgFor` self-heal in `databaseHooks.user.create.after` and `session.create.before`). Slug pattern `personal-${uuid}`, never deletable, never leavable.
- **Team orgs** with slug auto-gen, invitations (email-based with `@better-auth/organization`), role-based members, transfer ownership, leave.
- **Auto-cleanup** — `afterRemoveMember` deletes empty non-Personal orgs; `beforeDeleteOrganization` rejects Personal deletion.
- **Pages shipped**: `/organization/new`, `/settings/general` (rename + leave/delete danger zone), `/settings/team` (members + invitations + role updates), `/dashboard` (org-scoped landing), `/invitations` (incoming list).
- **Mutations shipped**: `create-org`, `update-org`, `delete-org`, `leave-org`, `transfer-and-leave`, `set-active-org`, `invite-member`, `accept-invitation`, `cancel-invitation`, `remove-member`, `update-member-role`.
- **Capability-based authorization** — `@packages/access-control` is the single source of truth (`ac`, `roles`, `OrgRole` / `OrgPermissions`, `authorizeRole`). Three layers, same predicate:
  - Server: `requireOrgPermission({ resource: ["action"] })` middleware.
  - Route gate: `ensureOrgPermission(perms)` in `beforeLoad`.
  - UI: `<Can requires={...} fallback={...}>` + `useAuthorization().can()`.
- **Owner transfer** — `transferAndLeaveMutationOptions` for last-owner-leaves flow.
- **Dev-only `<AuthorizationDevTool>`** — live capability matrix per role (mounted by the app shell, tree-shaken in prod).
- **`NO_ACTIVE_ORGANIZATION` → `null`** at the query layer (transient state, not error).

## Email — Resend + queue-based delivery ✅ Phase D.5

Durable email queue with in-repo templates and batch delivery. Provider-side suppression guards IP reputation (hard bounces auto-blocked).

- **`email_message` table** (`packages/drizzle/src/schema/email.ts`, migration `0015_shiny_skaar.sql`) — durable outbox for all outgoing emails. `IEmailService` (`QueuedEmailService`) enqueues rows; `EmailDeliveryWorker` drains them in batches.
- **`@packages/emails`** — in-repo React Email templates. One component + `subject()` per template key. Renders server-side at enqueue time. No Resend dashboard required on a fresh clone: `TEMPLATE_IDS` in the worker is an **override** — empty string renders the in-repo template, non-empty uses that Resend dashboard template.
- **`EmailDeliveryWorker`** — polls every 2 s, claims up to 300 rows (`FOR UPDATE SKIP LOCKED`, 120 s window), groups by `(kind, template)`, chunks to 100, one `resend.batch.send` per chunk. Rate limit: **10 req/s per team** (verified against live Resend API). `batchValidation: "permissive"` isolates invalid entries into `errors[]` without failing the entire chunk.
- **Port methods** — `sendTemplate`, `sendTemplateBatch`, `sendRaw`, `sendRawBatch`, all accepting `options.tx` to enqueue inside the caller's transaction (atomicity with the write that triggered the email).
- **Retry** — decorrelated jitter via `shared/jitter.ts` (same formula as webhook delivery). No `retry-after` header access (Resend SDK exposes only `{ data, error }`, headers not surfaced). After the ceiling attempts the row moves to `status = 'failed'` and `email.delivery.exhausted` is emitted.
- **Retention sweep** — `POST /internal/sweep-email-messages` purges `status = 'sent'` rows older than `EMAIL_MESSAGE_RETENTION_DAYS` (default 7d). `failed` rows kept deliberately as the operator's audit trace.
- **Typed templates** (`EmailTemplates` type, `TemplateVariables` per template — `shared/ports/email.port.ts`).
- **Idempotency** — `options.idempotencyKey` fanned out as `${key}/${index}` per recipient; worker-level idempotency key per batch request.
- **DNS hardening required** before production: SPF, DKIM (3 CNAMEs from Resend), DMARC. Gmail/Yahoo/Outlook reject unauthenticated bulk senders since 2024-2025. See `README.md` for records.
- **`scheduled_at` is supported in batch** (verified Resend API 2026). Batch cap: 100 emails/request. Hard-bounce suppression is provider-side and automatic — no local `email_suppression` table needed.

Files: `apps/api/src/shared/services/email.service.ts` (`QueuedEmailService`), `apps/api/src/shared/services/email-delivery-worker.service.ts`, `apps/api/src/shared/ports/email-queue.port.ts`, `packages/drizzle/src/schema/email.ts`, `packages/emails/src/`.

## Storage — S3-compatible (Cloudflare R2 prod / SeaweedFS dev, opt-in) ✅

Server is blind during the upload — three-step flow `presign` → `PUT` direct to provider → `confirm`.

- **Provider-agnostic** S3 SDK config (`region: "auto"`, `forcePathStyle: true`). Boot-time fail-hard on localhost endpoint or default creds in production.
- **Owner-scoped keys** — `<userId>/<scope>/<uuid>-<filename>`. Download + confirm reject keys without `<requestingUserId>/` prefix (`STORAGE_FORBIDDEN`).
- **Confirm mandatory** — server `HeadObject` validates size/contentType, deletes on mismatch, returns server-verified `{ key, size, contentType, publicUrl }`.
- **Validation at controller** (`modules/uploads/application/dto/*.dto.ts`): filename regex, scope regex, size cap, max TTL.
- **Multi-step factory** — `createUploadMutationOptions` resolves only after `confirm` succeeds; UI never sees "maybe uploaded" intermediate state.
- **Why three steps**: providers like R2 don't support Presigned POST policies (no `content-length-range`, verified 2026). PUT presigned + `confirm` is the correct shape.
- **Use-cases shipped**: `create-upload-url`, `confirm-upload`, `create-download-url`. Routes: `POST /uploads/presign`, `POST /uploads/confirm`, `POST /uploads/download`.

## RGPD / CCPA — erasure (Art. 17) + portability (Art. 20) ✅

Deletion + export cascade built before Billing/Audit so every future feature inherits the contract. A clone deployed to EU users is compliant day one.

- **Export** — `POST /me/export`, auth-gated, sync (walks the user's tables, uploads JSON to R2, emails a signed 7-day URL via Resend). Rate-limited 1/24h per user.
- **Delete** — `POST /me/delete`, 2FA-required + server-side sole-owner preflight re-check + **7-day soft-delete grace**. Cron `/internal/rgpd/process-pending-deletions` (HMAC-signed) wipes personal data (email, name, sessions, passkeys, MFA, R2 avatars) and **anonymizes** `member` rows (`userId → null`, tombstone email) so org audit trails stay intact.
- **Pre-flight gate** — `GET /me/delete/preflight` lists sole-owner non-personal orgs blocking deletion; UI shows per-row Transfer/Leave CTAs, Delete button disabled until cleared. No implicit auto-transfer (consent).
- **Cancel UX** — sign-in during the grace window prompts cancel/continue; clears `pendingDeletionUntil`.
- **Soft-delete confined to RGPD** — `deletedAt` + `pendingDeletionUntil` are the only soft-delete columns; everything else hard-deletes.
- **Public `/legal/data-rights`** — lists what's deleted vs anonymized vs retained per legal basis.
- **Events** — `user.deletion.{requested,cancelled}`, `user.deleted`, `user.export.{requested,completed}` → `compliance` audit trail.

Frontend cards (source: `features/rgpd/`): `DataExportCard` renders in `features/privacy/privacy.page.tsx` (relocated in A.5); `RgpdDeletionCard` (+ preflight blocking list) + cancel dialog render in `features/account/account.page.tsx` as a contextual danger zone (relocated in A.5). See [`HISTORY.md`](./HISTORY.md) for decisions.

## API — Hono on Bun ✅

- **Native `Bun.serve()`** (no `@hono/node-server`) — `bun build` for prod (~7 ms cold), `bun --hot` for dev.
- **Hono RPC** end-to-end types via `hcWithType` (one client instance, `tsc` resolves once). Custom fetch slot for `X-Request-Id`, future 401 handler / token refresh / Capacitor Bearer.
- **Pipeline** (in order): `requestId` → `httpLogger` (pino) → `secureHeaders` + `cors` → `sessionMiddleware` (one `auth.api.getSession()` per request) → `auth.handler` for `/api/auth/*` → `app.onError` (single error envelope).
- **CQRS**: Commands route through Use Cases; Queries hit Drizzle directly (no use case ceremony).
- **DI** via `inwire` — type inference, no declared interfaces, `AppDeps = typeof di`.
- **Logging**: `pino` (JSON in prod, `pino-pretty` in dev), every line carries `requestId`, status-driven log level.

## App — Vite + React 19 + TanStack ✅

- **TanStack Router code-based** — features own their routes via `<name>.route.tsx` (route definition) + `<name>.page.tsx` (page component, code-split chunk via `lazyRouteComponent`). Layouts/gates exported from `apps/app/src/router/layouts.tsx`. Routes assembled in a single hand-written `apps/app/src/router.tsx`. No `routes/` folder, no `routeTree.gen.ts`, no Vite plugin watcher. TanStack Start migration is near-zero refactor.
- **Route-level code-splitting** — each `<name>.page.tsx` ships as a lazy chunk (current floor: ~588 KB initial bundle, individual route chunks 1-43 KB). `defaultPreload: "intent"` triggers prefetch on hover/focus before the click — perceived latency near zero.
- **Devtools wired** in `app-providers.tsx` behind `import.meta.env.DEV` (TanStack Router devtools + React Query devtools, tree-shaken in prod).
- **TanStack Query** for all server state — session, active org, current membership, orgs list. Mutations via `mutationOptions` factories (call-site owns side-effects); hook wrappers only when side-effects always fire.
- **Forms**: `react-hook-form` + `@hookform/resolvers/zod` + shadcn `Form`. Mandatory `defaultValues`, never manual submit handlers.
- **Schema split** loose vs strict — same field validated differently in capture (sign-in) vs creation (sign-up / reset).
- **Theme**: `next-themes` (`attribute="class"`, `defaultTheme="system"`) + View Transitions API circle reveal with `prefers-reduced-motion` fallback.
- **Toasts**: `sonner`.

## App shell — top-nav + ⌘K palette ✅

- **Sticky header** with org switcher, theme toggle, user menu.
- **Contextual settings tabs** filtered by capability (`SETTINGS_TABS` declares `requires` + `requiresOrg`).
- **Command palette** (⌘K) — `NAVIGATION_ROUTES` filtered by capability.
- **Logo mark** — custom shadcn-pure primitive.

## UI — shadcn/ui (`@packages/ui`) ✅

Full shadcn/ui registry pre-installed, `shadcn-pure` rule enforced (use real slots, no `pt-6` / `space-y-4` patches).

- **Typography exports** — `TypographyH1` / `H2` / `H3` / `H4` / `P` / `Lead` / `Large` / `Small` / `Muted` / `InlineCode` / `Blockquote` / `List`. Never raw `<h1 className="text-5xl">`.
- **Custom primitives** (all `asChild`-compatible, all in `@packages/ui/components/ui/`):
  - `NavLink` — variants `plain` / `pill` / `underline` + `active` flag. Primitive owns style, router owns navigation: `<NavLink asChild variant="pill" active={isActive}><Link to="/x">…</Link></NavLink>`.
  - `BrandLink` — logo wordmark slot.
  - `TextLink` — inline underline-on-hover anchor.
  - `DestructiveActionDialog` — confirm-text dialog for irreversible actions.
  - `ListRow` — list-item primitive.
  - `FormTextField` — RHF `Controller` + shadcn `Input` wrapper (label + error + description).
- **Theme tokens** in `packages/ui/src/styles/globals.css` `@theme`. `className` reserved for layout (`flex`, `gap-*`, `mx-auto`); colors / typography / radius live in theme.

## DDD-kit (`@packages/ddd-kit`) ✅

Primitives for the business domain only (rule: never DDD for billing / auth / gating).

- `Result<T, E>` — no throw in domain or application.
- `Option<T>` — no `null` / `undefined` for absence.
- `Entity`, `Aggregate`, `ValueObject` (zod-validated via `protected validate()`), `UUID`, `DomainEvent`, `BaseRepository`, `UseCase`, `QueryHandler`.
- Events added in aggregate methods (`this.addEvent(...)`), dispatched in use cases AFTER successful persistence.

## Database — Drizzle + Postgres 17 ✅

- **Postgres on `localhost:5433`** (dedicated port, no clash with other local instances) via `docker compose up postgres -d`.
- **Schemas** in `packages/drizzle/src/schema/*.ts` — auth tables, organization tables.
- **`TransactionService`** — controllers manage transactions and pass to use cases.
- **`withOrg(table, orgId)` helper** for org-scoped list queries (rule: org-scoped tables NEVER queried without it).

## Tooling — zero-warning pipeline ✅

- **pnpm 10** + **Turborepo** (TUI, daemon-managed, `globalDependencies` bust caches on `biome.json` / `pnpm-workspace.yaml` / `.env*`).
- **Biome** — lint + format, single source.
- **knip** — unused exports / files.
- **jscpd** — duplication detection.
- **Husky + commitlint** — Conventional Commits enforced (lower-case subject).
- **lint-staged** — Biome on staged files only.
- **Pre-push** — full `pnpm ci:check`.
- **semantic-release** — `dev` → `main` merge commit triggers bundled bump + changelog. `feat` → minor, `fix`/`perf`/`refactor`/`build` → patch, `BREAKING CHANGE:` → major.
- **`bun test` (api) + `vitest` (packages, app)** — BDD style, mock at port level, test `Result` / `Option` transitions.

## Observability ✅

- **`pino`** + **`hono-pino`** — JSON in prod, `pino-pretty` in dev. `info` prod / `debug` dev. Status-driven HTTP log level (`5xx` → `error`, `4xx` → `warn`).
- **Single `app.onError(errorHandler)`** — `HTTPException` → `{ error: { code, message, requestId } }`. No per-route try/catch.
- **Request ID** propagated via `X-Request-Id` header; every log line carries it.
- **Sentry error tracking** (Phase 0.4) — `@sentry/bun` (api) + `@sentry/react` (app), NoOp without `SENTRY_DSN`. `errorHandler` captures `>= 500` automatically with `requestId/userId/orgId/path/method` tags ; `<Sentry.ErrorBoundary>` wraps the app provider tree. RGPD-clean scrubbing (whitelist drop of `Cookie`, `Authorization`, request body, query string, `email`, `username`, `ip_address`). `pinoIntegration` turns every `logger.warn|error` into a breadcrumb. `@sentry/vite-plugin` uploads source maps in CI when `SENTRY_AUTH_TOKEN`+`SENTRY_ORG`+`SENTRY_PROJECT` set. OTel + Prometheus `/metrics` deferred to Phase D.1 (Bun OTel manual + no Grafana consumer yet). See [`./OBSERVABILITY.md`](./OBSERVABILITY.md).

## Disaster recovery ✅ (doc-only)

PITR delegated to the managed Postgres provider (Neon/Supabase/RDS/Railway one-click) — primary defense. clean-stack ships no backup code on purpose: SOTA 2026 closed the case (pgBackRest unmaintained, providers ship PITR sub-minute RPO).

- **`docs/DISASTER-RECOVERY.md`** — RPO/RTO targets, 3-2-1 rule applied, PITR setup per provider, restore runbook, lifecycle + versioning snippets.
- **Weekly portable `pg_dump` export** — copy-paste recipes for GitHub Actions, Railway Cron, and K8s CronJob. Streams `pg_dump | gzip | aws s3 cp -` (no OOM). Targets `backups/postgres/<ISO>.sql.gz` in the existing S3 bucket. Read-only Postgres role mandated.
- **Monthly automated restore-test** — GitHub Actions workflow recipe spawns Postgres `:17-alpine`, downloads latest, restores, runs inline `psql count(*)` smoke check, fails loud.

See [`./DISASTER-RECOVERY.md`](./DISASTER-RECOVERY.md).

## Event-driven foundation ✅

Transactional outbox + dispatcher + audit/webhook subscribers. **Zero plumbing post-clone** — the dev declares an event in `packages/events`, calls `addEvent()` in their aggregate, runs the use case via `uow.run()` and the rest is automatic (audit log row, webhook fanout to subscribed clients, in-process handlers via `onEvent(...)` auto-discovered through inwire).

- **Outbox**: `outbox_event` table, UUID v7 PK, partial index on pending rows, `pg_notify` trigger ensured idempotently at boot (`CREATE OR REPLACE TRIGGER`).
- **Dispatcher**: in-process Bun worker, dedicated `pg.Client` LISTEN + 30s poll fallback + `SELECT ... FOR UPDATE SKIP LOCKED` drain (multi-instance safe). Built-in subscribers run inside the dispatch TX (atomic), user `onEvent` handlers post-commit (isolated).
- **Audit log** (`audit_log`, SOC2 §CC7.2 / ISO 27001) — append-only, retention `operational` (90d) vs `compliance` (7y) driven by `RETENTION_MAP`. Tamper-evidence hash chain (`prev_hash`/`hash`/`sequence`, SHA-256 + advisory lock) gated by `AUDIT_TAMPER_EVIDENCE`; operator read UI at `/admin/audit-log` (C.2): filters + cursor pagination + metadata diff + `GET /admin/audit-log/verify` chain check, gated `requirePlatformAdmin`.
- **Outbound webhooks** (`webhook_endpoint` + `webhook_delivery`) — HMAC-SHA256 signed (`t=<ts>,v1=<hex>` Stripe-style), AEAD-encrypted secrets at rest (`@noble/ciphers` XChaCha20-Poly1305 + HKDF per org). Decorrelated jitter retry (1m/5m/30m/2h/12h paliers), dead-letter after 5 attempts, replay endpoint. Claim window pattern in delivery worker — fetch HTTP outside TX, no lock starvation.
- **BetterAuth bridge** (`auth.ts`) emits 25 unique events automatically (17 user + 8 org) via 4 voies: user/session lifecycle (`databaseHooks`), MFA/passkey/email-verified/password-changed/profile-updated/email-change-requested/link-social/backup-code (`hooks.after` with `createAuthMiddleware`, `APIError` filter; emit placement for `verify-backup-code` uses `ctx.context.newSession` before the `userId` early-return guard), password reset / magic link (native callbacks), org/member/invitation (`organizationHooks`, with both `afterAddMember` AND `afterAcceptInvitation` for `ORG_MEMBER_JOINED` to cover direct adds + invite acceptance). RGPD service emits 5 more, UploadService emits 3, WebhooksService emits 3, PolicyAcceptanceService emits 1 (`user.policy.accepted`), SecurityMiddleware emits 3 (`security.rate_limit.exceeded`, `security.csp.violation`, `security.csrf.rejected`), the abuse-prevention hooks in `auth.ts` emit 2 (`security.signup.rejected` on a disposable-email block, `security.password.breached` on a HIBP hit), `ConsentService` emits 2 (`user.cookie_consent.granted`, `user.cookie_consent.withdrawn` — retention `compliance`), and `BackupCodeUsedNotifier` (first `onEvent` handler, post-commit) sends an on-use email → **54 events total**.
- **Catalog `@packages/events`** — 54 events (50 subscribable + 4 internal) with Zod payloads + `RETENTION_MAP`, shared api+app+future workers.
- **Request correlation** — every event carries the originating request's `X-Request-Id` in `outbox_event.metadata.requestId` (captured via an `AsyncLocalStorage` context, works inside BetterAuth hooks too), copied into `audit_log.request_id` so audit rows join to their logs + Sentry event on one key.

## Security & hardening ✅ Phase C.1

Deploy-safe perimeter — rate-limit, strict CSP, and stateless CSRF protection, all wired before any business feature.

**Rate-limit** (`apps/api/src/shared/middleware/rate-limit.middleware.ts`):

- Unified Hono middleware (`rate-limiter-flexible`); BetterAuth built-in rate-limit disabled — one policy wins, no double-counting.
- Policies: `global` (all routes) + 8 auth-burst policies (`/sign-in/email`, `/sign-up/email`, `/magic-link`, `/reset-password`, `/change-password`, `/verify-email`, `/two-factor`, `/passkey`) with tighter windows.
- IETF `RateLimit` / `RateLimit-Policy` / `Retry-After` headers on every rate-limited response.
- **Fail-closed on auth** — a store outage throws 503 on auth routes rather than silently skipping the guard (OWASP A10:2025). Global routes fail-open.
- Trusted-proxy IP resolution: `TRUSTED_PROXIES=private` (Railway/Fly), CIDR, or exact IP. OWASP rightmost-non-trusted algorithm — first untrusted IP wins.
- Store progression: memory (dev / single-replica) → Postgres (multi-replica, dedicated pool isolated from app queries). Redis is not yet implemented — envisaged if multi-replica pressure on the DB justifies it (would require a new factory + enum value).
- Front: `sonner` toast on 429 with countdown from `Retry-After`.

**CSP** (Caddy + Vite, _not_ a Hono middleware):

- Per-request nonce via Caddy `{http.request.uuid}` injected into the `Content-Security-Policy` header; same value forwarded to Vite via `html.cspNonce` meta tag.
- `'strict-dynamic'` policy — no `'unsafe-inline'`, no host allowlist.
- Public `POST /csp-report` endpoint: IP-rate-limited, `Cross-Origin-Resource-Policy: cross-origin` (browsers need it for report delivery), document-uri origin filter (drops 3rd-party extension noise).
- Emits `security.csp.violation` audit event (`operational` retention).
- Trusted Types deferred (no eval/DOM-sink usage today — land when needed).

**CSRF** (`apps/api/src/shared/middleware/csrf.middleware.ts`):

- Origin-allowlist on unsafe HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`). Stateless — no token, no cookie, no endpoint to maintain (the Next.js Server Actions / SvelteKit model).
- Allowlist is the CORS origin list (`CORS_ORIGIN`) — single source of truth, zero drift.
- Bearer-skip: requests with `Authorization: Bearer …` bypass the check (Capacitor mobile, PATs, internal HMAC-signed calls).
- Emits `security.csrf.rejected` audit event (`operational` retention).

**Hardened headers** (Caddy, no Hono duplication):

- `Strict-Transport-Security` (HSTS, 1 year, includeSubDomains).
- `Content-Security-Policy: frame-ancestors 'none'` (clickjacking).
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` (camera, microphone, geolocation off by default).

**Abuse prevention** (s5a):

- **Disposable-email block at sign-up** — a ~90k-domain static blocklist (`disposable-email-domains`) plus a DNS MX-record lookup (a domain with no MX is treated as disposable). **Fail-open**: a DNS error or timeout logs a warning and lets the sign-up through (`DISPOSABLE_EMAIL_BLOCK_ENABLED`, `DISPOSABLE_EMAIL_DNS_TIMEOUT_MS`). Emits `security.signup.rejected` (`reason: "disposable_email"`).
- **Breached-password telemetry** — a HIBP hit on sign-up / reset / change (the request is already rejected by the NIST policy) emits `security.password.breached`, making the attempt observable in the audit trail. Both events carry the actor and use `operational` retention.

**Prod boot guard**: api fails hard (`process.exit(1)`) on missing `CORS_ORIGIN` — a silent empty-string allowlist would make CSRF protection a no-op.

**Events** (`operational` retention): the perimeter adds `security.rate_limit.exceeded` · `security.csp.violation` · `security.csrf.rejected`; the s5a abuse-prevention hooks add `security.signup.rejected` · `security.password.breached`. After C.6 the catalogue stands at **54 events total / 50 subscribable / 4 internal** (C.5 base 52 + 2 new MFA compliance events from C.6).

See [`./EVENTS.md`](./EVENTS.md) for the full DX guide (how to add an event, build a handler, multi-tenant safety, BetterAuth bridge specifics, HMAC verification, known limitations).

## Billing — Stripe subscriptions + feature/seat gating ✅ Phase B.1

Per-organization subscriptions with zero billing backoffice. Stripe Checkout handles upgrades; Stripe Billing Portal handles management. The app shows the plan, seat usage, and the two buttons. A public `/pricing` page lists live plans from the Stripe catalog.

**Subscription state**: the plugin's `subscription` table (webhook-synced, FK to `organization`). Not `organization.metadata` — metadata is untyped, unqueryable, and diverges under out-of-order webhooks.

**Hybrid catalog** (`apps/api/src/modules/billing/config.ts`):
- Prices, copy, and `marketing_features` (pricing-page bullets) live in Stripe Products.
- Feature entitlements, tier rank, and `maxMembers` live in the typed `ENTITLEMENTS` map in code.
- `metadata.tier` on the Stripe Product is the sole join key. Editing a gate = a code review, not a silent dashboard edit.

**Three gate axes** — the transferable pattern for any new premium feature:
- **Role**: `billing:["read","manage"]` in `@packages/access-control`. `billing:read` = owner + admin; `billing:manage` = owner only. `requireOrgPermission({ billing: ["manage"] })` on `POST /billing/portal`.
- **Seats**: `ENTITLEMENTS[tier].maxMembers` enforced in `beforeAddMember` + `beforeAcceptInvitation` + `beforeCreateInvitation`. Unlimited = `null` (JSON-safe). Returns `403 BILLING_SEAT_LIMIT_REACHED`.
- **Tier/feature**: `requireFeature(flag)` / `requirePlan(minTier)` (back, `402 BILLING_PAYMENT_REQUIRED`); `useEntitlements()` / `<FeatureGate flag>` / `<PlanGate minTier>` (front).

**Free-tier model**: unlimited team orgs; each free org gets 3 members and no premium features; paid orgs inherit higher caps from `ENTITLEMENTS`. No per-account org-count cap.

**Module** `apps/api/src/modules/billing/` (infra no-DDD, same class as `modules/consents/`):
- `CatalogService` — assembles `Plan[]` (Stripe Products + `ENTITLEMENTS` merge). Degrades to free-only when `STRIPE_SECRET_KEY` is unset.
- `EntitlementsService` — `resolveEntitlements(tier)` + `getSubscriptionTier(orgId)`.
- `SubscriptionReadStore` — §8-instrumented Drizzle reader for the `subscription` table.
- `StripeCatalogSourceAdapter` — all Stripe SDK calls, instrumented `op: "http.client"`.
- Routes: `GET /billing/plans` (public), `GET /billing/subscription` (requireAuth), `POST /billing/checkout`, `POST /billing/portal`.

**Frontend** (`apps/app/src/features/billing/`): public `/pricing`; `/settings/billing` (plan + usage + buttons); `useEntitlements()` hook; `<FeatureGate>` + `<PlanGate>` render gates.

**Events** (4 new, catalog → **46**): `billing.subscription.{created,updated,cancelled}` (`compliance` retention) + `billing.payment.failed` (`operational`), emitted from `@better-auth/stripe` callbacks in `auth.ts`.

**Env**: `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`. No `STRIPE_PRICE_*` vars — prices live in Stripe. Unset `STRIPE_SECRET_KEY` → free-only degradation.

**Quota gating (B.2, dormant skeleton)**: `ENTITLEMENTS[tier].quotas` typed catalog; `assertQuota`/`requireQuota` middleware (429 `BILLING_QUOTA_EXCEEDED`); `reserveQuota`/`countScopedRows` advisory-lock atomic reserve (`apps/api/src/shared/db/quota-reservation.ts`); `quota_usage` table + `modules/quotas/` store (`IQuotaUsageStore.{increment,current,reset}`); front `useQuota` + `<QuotaGate>` (`apps/app/src/shared/auth/quota-gate.tsx`). 1 new event (`billing.quota.exceeded` operational) → **47 events total**. Primitives knip-whitelisted as boilerplate-pattern entries. See [`docs/QUOTA-GATING.md`](./QUOTA-GATING.md) for the activation guide.

See [`HISTORY.md`](./HISTORY.md) for the state-SSOT decision, hybrid-catalog rationale, unlimited=null choice, and pre-merge review catches.

## Outbound webhooks front UI + public event catalog ✅ Phase C.5

Full operator surface for managing webhook endpoints and inspecting deliveries, plus a public developer reference for the event catalog. The back-end (CRUD API + worker + outbox integration + SSRF guard + rotation) is on the API; this section covers the front-end UI and the back-end hardening added alongside it.

**Back-end hardening (Plans 1–2)**:

- **SSRF guard** — webhook URLs validated at create/update AND re-validated at delivery time (anti-DNS-rebinding). Blocks: loopback (127.0.0.0/8, `::1`), RFC1918 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16), link-local (169.254.0.0/16, `fe80::/10`), ULA (fd00::/8), CGNAT (100.64.0.0/10), cloud-metadata endpoints (169.254.169.254, 169.254.170.2, fd00:ec2::254, metadata.google.internal). Rejections → `WEBHOOK_URL_FORBIDDEN` (403).

- **Dual-secret rotation** (`POST /settings/webhooks/:id/rotate-secret`) — grace window `WEBHOOK_SECRET_GRACE_HOURS` (default 24h). During grace, both old + new secrets sign; `x-webhook-signature` carries multiple `v1=` values. Consumers accept on first match. New secret returned once, never re-exposed.

- **Per-attempt delivery timeline** — `webhook_delivery_attempt` table: `attemptNumber`, `requestHeaders`, `requestBody`, `responseStatus`, `responseHeaders`, `responseBody` (capped at `WEBHOOK_RESPONSE_CAPTURE_BYTES`, default 4096), `durationMs`, `error`, `attemptedAt`. Exposed via `GET /settings/webhooks/:id/deliveries/:deliveryId`.

- **Auto-disable failing endpoints** — after `WEBHOOK_AUTO_DISABLE_AFTER_DAYS` (default 5) of failures with ≥ `WEBHOOK_AUTO_DISABLE_MIN_FAILURES` (default 2) consecutive failures: endpoint `status` → `auto_disabled`, `webhook.endpoint.disabled` emitted. Re-enable is manual + resets counters.

- **Wildcard subscriptions** — `"*"`, `"<group>.*"`, or exact event names. Internal webhook events never fan out (feedback-loop prevention).

- **Test event** (`POST /settings/webhooks/:id/test`) — sends `webhook.test` to the endpoint. Also auto-fired on endpoint creation for immediate reachability feedback.

- **4 new internal events** (`operational` retention, non-subscribable, non-fanout): `webhook.test`, `webhook.endpoint.secret_rotated`, `webhook.endpoint.disabled`, `webhook.delivery.exhausted`. **Catalog → 52 total / 48 subscribable / 4 internal**.

**Frontend** (`apps/app/src/features/webhooks/` + `apps/app/src/features/developers/`):

- Gated `webhooks: ["read"]` (list/deliveries) / `webhooks: ["write"]` (CRUD/rotate/test). Wired in `SETTINGS_TABS`.
- `/settings/webhooks` page (`webhooks.{route,page}.tsx`) — endpoint list with status badges (enabled / paused / auto-disabled), create/edit in a side Sheet (name, URL, `EventTypePicker` grouped by namespace with group wildcards + select-all), per-endpoint delivery list (cursor-paginated, status filter), per-delivery timeline drawer showing each attempt's request/response headers + bodies, one-shot secret reveal on create, rotate-secret dialog, send-test button.
- `EventTypePicker` (`_components/event-type-picker.tsx`) — consumes `SUBSCRIBABLE_EVENT_TYPES` from `@packages/events`. The picker and the public catalog share the same SSOT: no drift possible.
- **Auto-disabled badge** — `status: "auto_disabled"` renders a destructive "Auto-disabled — delivery failures" badge, distinct from the yellow "Paused" badge for user-paused endpoints.
- **Queries** (`_api/webhooks.queries.ts`): `endpointsQueryOptions`, `endpointDeliveriesQueryOptions` (paginated), `deliveryDetailQueryOptions` (with `attempts[]`).
- **Mutations** (`_api/webhooks.mutations.ts`): create / update / delete / `rotateSecretMutationOptions` / `sendTestMutationOptions`.
- Public `/developers/events` page (`developers/developers.{route,page}.tsx`, no auth, under `rootRoute`) — `EventTypesTable` component: all 48 subscribable events with group, retention, description, and expandable JSON schema per event (via `jsonSchemaForEvent` wrapping Zod 4 native `z.toJSONSchema({ unrepresentable: "any" })`). Includes a Node.js signature-verification snippet. Linked from the command palette.

---

## Privacy dashboard ✅ Phase A.5

M3 UX hub consolidating privacy, compliance, and session surfaces into `/settings/privacy`. Pure UI composition — 0 back-end changes, 0 migrations, 0 new events.

**Feature files** (`apps/app/src/features/privacy/`):
- `privacy.route.tsx` + `privacy.page.tsx` — nested under `_protected`, personal scope (`requiresOrg: false`).
- `components/policy-acceptance-card.tsx` — reads acceptance status via `policiesQueryOptions` (prefetched in the shell layout); shows accepted version + up-to-date badge. Acceptance history deferred.
- `components/data-sources-card.tsx` — static list of active `SUB_PROCESSORS` from `apps/app/src/shared/sub-processors.config.ts`.

**Page composition**: `<PolicyAcceptanceCard />` + `<ConsentSettings />` (A.4) + `<DataSourcesCard />` + `<DataExportCard />` (rgpd) + `<SessionsCard />` (security).

**Relocations in A.5**:
- `<DataExportCard />` + `<SessionsCard />` moved FROM `account.page.tsx` TO `privacy.page.tsx`.
- `<RgpdDeletionCard />` stays on `account.page.tsx` (contextual danger zone at the bottom).
- `org-danger-card.tsx` + `transfer-leave-dialog.tsx` moved FROM `features/danger/` TO `features/organization/components/`, rendered at bottom of `organization.page.tsx`. `features/danger/` deleted.
- `sub-processors.config.ts` moved FROM `features/legal/` TO `apps/app/src/shared/` (two consumers: legal sub-processors page + `DataSourcesCard`).

**Navigation**: Privacy tab added to `SETTINGS_TABS`; Danger entry removed from `SETTINGS_TABS` + command-palette.

0 events. Catalog stays **54 total / 50 subscribable / 4 internal**.

---

## Roadmap (not yet shipped)

See [`../ROADMAP.md`](../ROADMAP.md) for the full plan with constraints + extension points.

- **Admin & impersonation** — BetterAuth `admin` plugin.
- **Front UI for webhooks** ✅ **shipped** (Phase C.5 — see above).
- **Tamper-evidence audit hash chain** ✅ **shipped** (Phase C.2 — env-gated `AUDIT_TAMPER_EVIDENCE`, see above).
- **Domain-event → telemetry subscribers** (Sentry breadcrumb / OTel span attr / Prom counter per event-type) — trivial `onEvent(...)` additions. Sentry capture on 5xx errors already wired via `IInstrumentation` (Phase 0.4); OTel + Prom subscribers land with Phase D.1 Grafana consumer.
- **i18n** — TanStack Router locale routes + typed message catalogs.
