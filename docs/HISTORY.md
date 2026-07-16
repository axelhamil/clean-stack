# HISTORY

Shipped phases — full architectural log. The roadmap stays forward-looking; everything completed lives here.

Each section preserves the original task list (now `[x]` for the as-built record) plus the **why** and the **non-obvious decisions** baked into the codebase. New contributors read this to understand *why the code looks like it does*.

> **Note on paths**: file paths in entries below reflect the layout at the time of shipping. The codebase has since migrated to vertical-slice on both sides (front: `features/<x>/<x>.route.tsx` + `shared/`, code-based routing via `apps/app/src/router.tsx`; api: `modules/<context>/{application,infrastructure,routes.ts,module.ts}` + `shared/`, inwire `defineModule()` per context). For the current canonical layout see `CLAUDE.md` `## Layout`. The decisions and rationales below stay accurate — only the directory containers moved.

---

## Auth — BetterAuth (end-to-end) ✅ Phase 1 · Phase 2 (organization)

**Why**: own the token, multi-provider, typed plugins (Stripe, organizations, 2FA, passkeys, magic-link), DB-backed sessions, first lib that runs natively on Bun + Hono with no hacks.

- [x] Install `better-auth` + Drizzle adapter (`better-auth/adapters/drizzle`)
- [x] Auth schemas generated via `@better-auth/cli generate` → `packages/drizzle/src/schema/auth.ts` (6 tables: user, session, account, verification, two_factor, passkey)
- [x] Hono handler: `app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))`
- [x] React client: `createAuthClient` in `apps/app/src/adapters/auth-client.ts`
- [x] Plugins: `twoFactor`, `passkey`, `magicLink`, `bearer` (mobile/Capacitor-ready). `organization` shipped in Phase 2; `stripe` deferred.
- [x] `sessionMiddleware` (`adapters/middleware/auth.middleware.ts`) populates `c.var.user` / `c.var.session` ; companion `requireAuth` middleware throws `HTTPException(401)` on protected handlers.
- [x] Pages `/sign-in`, `/sign-up`, `/forgot-password`, `/verify-email`, `/reset-password`, `/magic-link`, `/two-factor` in `features/auth/`.
- [x] Pathless layouts `routes/_protected.tsx` (block when no session) and `routes/_guest.tsx` (block when already logged in) — single `beforeLoad` shared by all children, URLs unchanged.
- [x] Cookies: `httpOnly` + `sameSite=lax` + `secure` in production.
- [x] **Performance**: `session.cookieCache` (5 min) on the server — auth check is signature-only between refreshes (no DB hit). DB stays the source of truth at expiry → instant revoke on sign-out/ban.
- [x] **Native readiness**: `bearer()` plugin enables `Authorization: Bearer <token>` alongside cookies. Web stays cookie-based (httpOnly, XSS-safe), Capacitor/mobile uses bearer with secure storage. Same session row, transport differs.
- [x] **Email URLs route through the app, not the API** — every email link points to `${APP_URL}/<route>?token=...`. The frontend page consumes the token via the typed client (`authClient.verifyEmail`, `resetPassword`, `magicLink.verify`). No more `callbackURL` mangling by Outlook & co.
- [x] **Pino structured logging + centralised error handler** — `hono-pino` middleware (`adapters/middleware/logger.middleware.ts`), JSON in prod, `pino-pretty` in dev. Single `errorHandler` (`adapters/middleware/error.middleware.ts`) returns `{ error: { code, message, requestId, stack? } }`.
- [x] **Session as TanStack Query, not React state** — `sessionQueryOptions` (`adapters/queries/session.ts`, staleTime 5 min aligned with `cookieCache`). Router context only exposes `queryClient`; gates do `await context.queryClient.ensureQueryData(sessionQueryOptions)` in `beforeLoad`. No `useSession()` React bridge, zero race between nanostores and beforeLoad.
- [x] **Realtime cross-tab session sync** — native `BroadcastChannel('clean-stack-auth')` (`adapters/auth-broadcast.ts`, ~15 LoC, no experimental dep). Auth mutations call `broadcastAuthChange()` after refetching the session query; `app-providers.tsx` listens once and on receive does `refetchQueries(['session']) + router.invalidate()`. Tab A signs out → tab B (idle on `/dashboard`) instantly transitions to `/sign-in` without polling, hard reload, or navigation in B.
- [x] **Strong password schema split** — `_schemas/auth.schema.ts` exposes `passwordSchema` (loose: `min(1)`, used by sign-in to capture, the server validates) and `strongPasswordSchema` (strict: `min(12).max(128)` + lowercase/uppercase/digit, used by sign-up + reset). NIST-aligned: no required special character.
- [x] **StrictMode-safe token consumption** — `useRef(false)` guard in `verify-email.page.tsx` and `magic-link.page.tsx` prevents the dev-only double-fire of single-use tokens.

---

## Multi-tenant — BetterAuth `organization` plugin ✅ Phase 2

**Why from day one**: migrating single-user → multi-tenant after the fact is hell (backfill `organizationId` everywhere, orphaned owners, rewrite every query). The reverse is free: if it ends up being B2C, every user gets an invisible auto-created "personal org".

- [x] `organization` plugin enabled in the `auth` config
- [x] Drizzle schemas generated: `organization`, `member`, `invitation` (+ `team` if needed)
- [x] Auto-create a personal org on signup (`databaseHooks.user.create.after`, slug `personal-${orgId}` — UUID v4, never user-visible)
- [x] Session enriched with `activeOrganizationId` → Hono middleware that pushes it into `c.var.orgId`
- [x] **Every business table** has an `organizationId` FK from the very first migration (never added later)
- [x] Drizzle helper `withOrg(qb, orgId)` to systematically scope queries
- [x] Pages: `/org/new`, `/settings/general`, `/settings/members`, `/settings/invitations` in `features/`
- [x] Org switcher in the top-nav header (`authClient.organization.setActive(id)`), Command popover with search
- [x] Email invitations (dedicated Resend template)
- [x] Stripe customer = **per organization**, not per user (the Stripe plugin supports it natively — wired in Phase 3)
- [x] **Slug auto-generated, never user-input** — create-org form only asks for `name`; mutation generates `org-${crypto.randomUUID()}`. Slug is a DB uniqueness constraint, not a UX surface. Reintroduce the field only if a future feature exposes the slug in URLs.

### Capability-based authorization layer (post-merge hardening)

The plugin ships with built-in role checks (`auth.api.organization.*` enforce them on plugin endpoints), but our business routes + UI need the same predicate without re-implementing it. The fix: a shared workspace package + a three-layer contract.

- [x] **`@packages/access-control`** — single source of truth. Wraps `createAccessControl` (better-auth/plugins/access) with `defaultStatements` extended by `organization: ["update", "delete", "leave"]` + `billing: ["read", "manage"]`. Exports `ac`, `roles = { owner, admin, member }`, `STATEMENTS`, types `OrgRole` / `OrgPermissions`, and a sync `authorizeRole(role, permissions, connector?)` predicate. The `as unknown as AccessControl` cast required by BetterAuth's generic plugin signature is hidden inside the package — call sites stay strict-typed. Built with `tsup`, ESM-only, peer-dep on `better-auth`.
- [x] **Three layers, one contract**: server `requireOrgPermission(permissions)` middleware (`apps/api/src/adapters/middleware/org.middleware.ts`) — wraps every business route guarded by capability, throws `HTTPException(403)` on deny. Front route gate `ensureOrgPermission(permissions)` (`apps/app/src/adapters/route-helpers/ensure-org-permission.ts`) — `beforeLoad` helper that does `ensureQueryData(currentMembershipQueryOptions)` + `authorizeRole` + `redirect`. UI gate `<Can requires={...}>` (`apps/app/src/adapters/components/can.tsx`) backed by `useAuthorization()` (`apps/app/src/adapters/hooks/use-authorization.ts`) — declarative subtree gating with optional `connector="OR"` and `fallback` slot. Same predicate everywhere; renaming an action requires touching the package only.
- [x] **Capability-based, never role-based, in feature code** — describe `{ organization: ["update"] }`, not `["owner", "admin"]`. Children call `useAuthorization` themselves rather than receiving boolean `canEdit` props (rule 14 promotion: the row owns its own permission check, the page passes only data).
- [x] **Flat `_org-scope` route layout** — one pathless gate (`_org-scope.tsx`) ensures active-org-required; capabilities live per-route via `beforeLoad: ensureOrgPermission({...})`. Avoids stacking `_org-admin` / `_org-owner` / `_can-manage-billing` pathless tiers as new resources land.
- [x] **Navigation declares `requires: OrgPermissions` + `requiresOrg: boolean`** — `SETTINGS_TABS` (`adapters/components/contextual-tabs.tsx`) and `NAVIGATION_ROUTES` (`adapters/components/command-palette.tsx`) filter via `useAuthorization().can(requires)`. The visible tab set matches what the gate accepts; no drift between "I see the tab" and "the gate lets me in".
- [x] **`AuthorizationDevTool`** — dev-only floating panel (`adapters/components/authorization-devtool.tsx`, mounted in `__root.tsx`, tree-shaken via `import.meta.env.DEV`). Visualises the active session's role and the full capability matrix derived from `STATEMENTS` × `roles`. `PERSONAL_BLOCKED` map overlays UI gating for actions the lifecycle blocks on Personal orgs (delete/leave). Use to verify gating per role without seeding test users.

### Lifecycle hooks — self-heal + auto-cleanup

Personal org is structurally identical to a team org for every operation except delete/leave (cf rule 5). The lifecycle exception is encoded in two places: `isPersonalOrg(slug)` helper + the server hooks below.

- [x] **`ensurePersonalOrgFor(userId)`** — idempotent self-heal in `auth.ts`. Returns existing membership orgId or creates a new Personal org + member row in a transaction. Runs in `databaseHooks.user.create.after` (signup — covers new users) AND `databaseHooks.session.create.before` (sign-in — back-fills legacy users that pre-date the signup hook with `activeOrganizationId: null`). Never duplicate the create-personal-org logic inline.
- [x] **`afterRemoveMember`** — non-Personal orgs auto-collapse when the last member leaves. Hook checks remaining member count post-leave and deletes the empty org via Drizzle. Skipped for Personal orgs (the user must delete their account to remove their Personal org). Empty orgs left behind = zombies in the org table; auto-cleanup keeps it truthful.
- [x] **`beforeDeleteOrganization`** — rejects Personal org deletion outright (`throw new Error("Personal organization cannot be deleted...")`). The front mirrors this by hiding the Leave button on Personal and rendering a hint on Delete (account deletion is the only path).
- [x] **Owner-leave flow** — owner of a non-Personal org can leave: sole member → org auto-deletes via `afterRemoveMember`; sole owner with other members → must transfer ownership first. `transferAndLeaveMutationOptions` (`adapters/mutations/transfer-and-leave.ts`) is the multi-step factory: `updateMemberRole` then `leave`. UI is `TransferLeaveDialog` (`features/settings/_components/transfer-leave-dialog.tsx`). Post-leave both flows call `switchToFirstRemainingOrg(queryClient)` (`adapters/utils/switch-to-first-org.ts`) + `broadcastAuthChange()`.
- [x] **`NO_ACTIVE_ORGANIZATION` translated to `null`** — `currentMembershipQueryOptions` and `activeOrgQueryOptions` catch BetterAuth's error code and return `null`. "No active org" is a valid transient state in our model (between orgs, pre-self-heal); letting the error bubble crashes any consumer that calls `ensureQueryData`.
- [x] **`broadcastAuthChange()` extended to org events** — `setActive`, `create-org`, `delete-org`, `leave-org`, `transfer-and-leave`, `accept-invitation`, `remove-member` all call the broadcast in their `onSuccess` (call site, not factory). Listener already refetches `["session", "active-org", "current-membership", "orgs"]`. Cross-tab consistency under the 5-min `cookieCache.maxAge` window.

### May 2026 cleanup — dropped the `teams` sub-plugin

- [x] **Removed the BetterAuth `teams` sub-plugin.** Grouping-only (no team-scoped roles or statements) added UX surface for ~zero value at this stage. Re-enables in two lines if a clear use-case emerges. Settings collapsed from a General/Members/Teams split to a single `Organization` tab with section-level `<Can>` gates per role.

---

## Email — Resend (dashboard templates) ✅ Phase 1

**Why**: templates managed from the Resend dashboard (no code, no rebuild to change wording), built-in versioning, native A/B test. Stays pragmatic: we just call the API by template ID.

- [x] Install `resend`
- [x] Port `IEmailService` (`apps/api/src/application/ports/email.port.ts`) + adapter `ResendEmailService` (`apps/api/src/adapters/services/email.service.ts`) wired through inwire DI in **contract mode** (key = interface name `IEmailService`).
- [x] **Type-safe variables per template** — `EmailTemplates` maps each template name to its required variables. Adding a new template = updating the type + adding a `RESEND_TPL_*` env var. Renaming a variable in the dashboard without updating code = TS red, no silent break.
- [x] **`Result<void, EmailError>`** — `sendTemplate` never throws, returns a discriminated `EmailError` (`EMAIL_TRANSPORT_NOT_CONFIGURED` | `EMAIL_PROVIDER_FAILURE`). Use cases keep the `Result` until the controller boundary; integration adapters (`auth.ts`) translate to `throw` only at the BetterAuth-hook frontier.
- [x] **Retry with exponential backoff** — 3 attempts (1s/2s/4s), retry only on `429` and `5xx` + network errors (`status === 0`). 4xx non-rate-limit fail fast (validation = retry futile). Distinct `STATUS_HINTS` log per `401` / `403` / `409` / `422` so prod debug isn't blind.
- [x] **`Idempotency-Key`** — `${event-type}/${sha256(token)[:32]}` (Resend pattern, 24h window). Hash via `Bun.CryptoHasher`. Safe under retries — same payload returns the original response, different payload returns 409 with explicit log hint.
- [x] **`SendTemplateOptions.from?`** — per-tenant `from` override slot for the future `organization` plugin (per-org sending domain). Defaults to `env.RESEND_FROM`. Adding it now = zero breaking change in phase 2.
- [x] **`SendTemplateOptions.locale?`** — slot reserved for the i18n phase. Adapter currently logs a warn ("not yet implemented") if passed; resolution will switch to `${template}_${locale}` env lookup when locale-prefixed templates land. Port stays stable.
- [x] **Boot-time fail-hard in production** — constructor throws if `NODE_ENV === "production"` and `RESEND_API_KEY` or any template ID is missing. Prevents a silent deploy where every transactional email is dropped. Dev mode keeps the warn-only fallback.
- [x] BetterAuth `sendVerificationEmail` / `sendResetPassword` / `magicLink.sendMagicLink` consume `di.IEmailService.sendTemplate` via a `dispatchEmail()` helper that unwraps `Result` (`EMAIL_PROVIDER_FAILURE` → throw → centralised error handler; `EMAIL_TRANSPORT_NOT_CONFIGURED` → `logger.warn`, never silent).
- [x] **IP reputation guarded by Resend, not by us** — Resend ships a domain-scoped suppression list since 2025: hard bounces and spam complaints auto-add the address; future sends to a suppressed address are blocked at the provider edge with a 422 + `email.suppressed` webhook event. **No own suppression table needed** until a product feature actually consumes it (org invitations gating, account-settings "your email bounces" UI, abuse detection). Building it earlier is the OpenUp anti-pattern: ~150 LOC + 2 tables sitting empty until the first consumer arrives. Promote on second occurrence (rule 14), not in anticipation. The webhook integration (`POST /webhooks/resend`, `resend.webhooks.verify()` first-party SDK helper, Svix HMAC, `svix-id` dedupe) ships when the first consumer lands.
- [x] **DNS** documented in `README.md` (SPF + DKIM CNAMEs from Resend dashboard + DMARC TXT progression `p=none` → `p=quarantine` once stable, target `p=reject`). **Mandatory before any production send** — Gmail (Feb 2024), Yahoo (Feb 2024), Microsoft Outlook (May 2025) all reject unauthenticated bulk senders with 550 5.7.515.

---

## Storage — Cloudflare R2 (prod) + SeaweedFS (dev, opt-in) ✅ Phase 1

**Why**: R2 = no egress fees, S3-compatible, SigV4 only. SeaweedFS local = same S3 API → one codebase, switched via env. **R2 drives the design** (SeaweedFS is for dev convenience, not a target). Originally MinIO; swapped to SeaweedFS in May 2026 after MinIO was archived (April 25, 2026, features moved behind enterprise license).

**R2 quirks that shape the design (verified 2026)**: R2 does **not** support Presigned POST policies — only PUT/GET/HEAD/DELETE. There is **no native `content-length-range`** condition. `ContentLength` and `ContentType` passed to a presigned PUT are *signed* (the client must send those exact headers or 403 `SignatureDoesNotMatch`), but R2 does not verify the actual body size against them. Real enforcement therefore requires a **post-upload `HeadObject` + `DeleteObject` on mismatch** step, which is what the `confirm` route does. Object Lock and Bucket Policies are not implemented on R2; do not depend on them.

**Three-step flow**: `presign` → client `PUT` direct to R2 → `confirm` (server `HeadObject`, deletes on size/content-type mismatch).

- [x] SeaweedFS added to `docker-compose.yaml` under profile `storage` (host port pinned to `8333`, bucket `clean-stack` auto-created by `seaweedfs-init` via `weed shell`) — dev only, opt-in.
- [x] Install `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` + `@hono/zod-validator`.
- [x] **Pure transport port** (`apps/api/src/application/ports/storage.port.ts`) — `IStorageService` exposes `presignUpload` / `presignDownload` / `headObject` / `deleteObject` / `publicUrlFor`. Zero business rules; the adapter just signs S3 requests and forwards SDK calls.
- [x] **S3 adapter** (`apps/api/src/adapters/services/storage.service.ts`) — `S3Client` with `region: "auto"` (R2's only accepted value), `forcePathStyle` (kept on for SeaweedFS/MinIO compat — harmless on R2). Boot-time fail-hard in production if `S3_ENDPOINT` is localhost or creds are the dev defaults (`dev`/`dev`). Presigned PUT signs `content-type` + `content-length` headers (`signableHeaders`) so the client can't drop them.
- [x] **Use-cases for orchestration only** — `create-upload-url`, `create-download-url`, `confirm-upload` (`apps/api/src/application/use-cases/`). Each gets `IStorageService` via constructor. **Owner-scoping enforced in use-cases**: every key is `<userId>/<scope>/<uuid>-<filename>`; download + confirm reject any key whose prefix is not `<requestingUserId>/` (`STORAGE_FORBIDDEN`). `confirm-upload` performs `HeadObject`, deletes on size/content-type mismatch, returns `STORAGE_INTEGRITY_FAILED`.
- [x] **Validation lives at the controller boundary** — Zod schemas in the route enforce filename regex (`^[\w\-. ]+$`), scope regex (`^[a-z][a-z0-9-]{0,31}$`), max size (`STORAGE_MAX_UPLOAD_BYTES`, default 50 MB), TTL defaults. Zod failures return 400 via the centralised error handler.
- [x] **Per-call granularity**: presign body accepts `scope` (default `"uploads"`) and `expiresInSeconds` (default 5 min for upload / 10 min for download), clamped server-side to `[STORAGE_PRESIGN_TTL_MIN_SECONDS, STORAGE_PRESIGN_TTL_MAX_SECONDS]` (default `[60, 3600]`).
- [x] **Env** (`apps/api/common/env.ts`): `S3_ENDPOINT` (R2 prod: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` or `…eu.r2.cloudflarestorage.com` for EU jurisdiction — once chosen, R2 cannot move the bucket), `S3_REGION` (R2: `auto`), `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`, `S3_PUBLIC_URL`, `STORAGE_MAX_UPLOAD_BYTES`, `STORAGE_PRESIGN_TTL_MIN/MAX_SECONDS`. Dev defaults to SeaweedFS (host port pinned to `8333`; in-network it's `seaweedfs:8333`).
- [x] Routes (typed RPC, chained into the `routes` export): `POST /uploads/presign`, `POST /uploads/confirm`, `POST /uploads/download`. All `requireAuth`. Error mapping: 403 (`STORAGE_FORBIDDEN`), 404 (`STORAGE_NOT_FOUND`), 422 (`STORAGE_INTEGRITY_FAILED`), 502 (`STORAGE_PROVIDER_FAILURE`).
- [x] **Flat DI container** (`apps/api/src/di/container.ts`) — inwire infers everything; sections by line comments (`// infra`, `// uploads`). Use-cases registered next to the infra ports they depend on, type-checked by inference (reorder a `.add()` to put a use-case before its port → `tsc` rouge). `AppDeps = typeof di` derived after `.build()`. Promote a section to `modules/<context>.module.ts` only when a bounded context grows large enough to bloat `container.ts`.
- [x] `createUploadMutationOptions` (`apps/app/src/adapters/mutations/create-upload.ts`) — TanStack Query `mutationOptions` factory chaining `presign` → `PUT` direct to R2 (with explicit `Content-Length`) → `confirm`. Returns `{ key, publicUrl, size, contentType }` only after server-verified integrity. Consumed via `useMutation({ ...createUploadMutationOptions, onSuccess, onError })`. Accepts optional `scope` + `expiresInSeconds`.
- [x] **First Hono RPC consumer** — `apps/app/src/adapters/api-client.ts` uses `hcWithType` from `api/client` (subpath export, pre-typed `ApiClient`), with custom `fetch` interceptor (X-Request-Id, slot for 401/Capacitor) and trailing-slash normalization. Future features call the API exclusively through this typed client.

> Dev: opt-in via `docker compose --profile storage up -d`. SeaweedFS has no auth by default (any creds accepted). No web console; use `aws s3 --endpoint-url=http://localhost:8333` or browse via the app.

---

## RGPD / CCPA — data deletion (Art. 17) + export (Art. 20) ✅ Phase 1

**Why**: clean-stack is a boilerplate cloned to start any SaaS. A clone deployed to EU users without Art. 17 (right to erasure) + Art. 20 (data portability) is illegal day one — fines up to 4 % of revenue. The cascade was built **before** Billing / Audit-log / Admin landed so every future feature inherits the deletion contract rather than retrofitting it. Lives in `apps/api/src/modules/rgpd/` (vertical slice — service + drizzle repo + public + internal routes) and `apps/app/src/features/rgpd/` (cards + forms + hooks). Shipped commits `fd3b4b7`, `bfcc15d`, `da659a0`.

- [x] **Export endpoint** `POST /me/export` — auth-gated, **sync** (walks the user's tables in-request, uploads the JSON bundle to R2, emails a signed 7-day URL via Resend `RESEND_TPL_DATA_EXPORT_*`). Rate-limited 1/24h per user via `lastExportRequestedAt`. The presigned URL is **never** put in an event payload — events carry only `storageKey` (security).
- [x] **Pre-flight ownership gate** `GET /me/delete/preflight` — returns the sole-owner non-personal orgs that block deletion. UI at `/settings/account` renders the blocking list with per-row `Transfer ownership` / `Leave org` CTAs; the `Delete account` button stays disabled while the list is non-empty. **Auto-transfer rejected on principle** — no implicit refiling of legal/billing responsibility onto a member without consent (mirrors the Personal-org deletion posture).
- [x] **Delete endpoint** `POST /me/delete` — auth + **2FA-required** (BetterAuth `twoFactor`) + server-side preflight re-check (409 `ACCOUNT_DELETION_BLOCKED` if a sole-owner org appeared between read and submit) + **7-day soft-delete grace**. Cron `POST /internal/rgpd/process-pending-deletions` (HMAC-signed) sweeps expired requests, wipes personal data (email, name, sessions, passkeys, MFA factors, R2 avatars) and anonymizes `member` rows (`userId → null`, `email → deleted-<uuid>@anonymized.local`).
- [x] **Cancel-deletion UX** — signing in during the grace window prompts a cancel/continue dialog; cancel clears `pendingDeletionUntil`.
- [x] **Soft-delete confined to RGPD** — `user.deletedAt` + `user.pendingDeletionUntil` are the **only** soft-delete columns in the codebase (rule 14 — no creep elsewhere; everything else is hard-delete).
- [x] **Public `/legal/data-rights` page** — linked from `/settings/account`, lists what's deleted vs anonymized vs retained per legal basis.
- [x] **Audit-log integration** — every state transition emits an outbox event (`user.deletion.{requested,cancelled}`, `user.deleted`, `user.export.{requested,completed}`); `AuditEventSubscriber` writes the audit row with `compliance` retention. Pino logging retained for ops debugging (different concern).

**Decisions (non-obvious, locked-in by code)**:

1. **Soft-delete grace, not immediate wipe** — Art. 17 allows a reasonable processing window. The 7-day grace doubles as a self-service "I changed my mind" path (cancel on sign-in) and a safety net against account-takeover-then-delete attacks. The cron is the only thing that hard-wipes.
2. **Anonymize `member`, don't cascade-delete it** — deleting the `member` row would corrupt org audit trails ("who invited whom"). Setting `userId → null` + a tombstone email keeps referential history intact while removing the PII link. The org's other members see "deleted user", not a broken page.
3. **Sole-owner preflight is server-authoritative, re-checked at submit** — the UI gate is UX; the `POST /me/delete` handler re-runs the preflight inside the request so a race (org ownership changing between page-load and click) can't orphan an org without an owner.
4. **2FA gate on a destructive irreversible action** — account deletion reuses the BetterAuth `twoFactor` challenge, consistent with the "step-up auth on irreversible ops" posture.

**Remaining** (tracked in their dependent phases, not here): E2E Playwright deletion-cascade gate (A.6), admin export-on-behalf + deletion overrides (C.3), Stripe customer cleanup during wipe (B.1).

---

## App shell — top-nav + ⌘K command palette ✅

**Why**: sidebar SaaS shells are the 2010-2024 standard, but the SOTA 2026 wave (Vercel, Linear web, Resend, Trigger.dev) consolidated on top-nav + global ⌘K palette. Less chrome, better mobile, keyboard-first power-users.

- [x] Top-nav header (`adapters/components/app-shell.tsx`) — sticky, blurred bg, logo + org switcher + primary nav (Dashboard / Settings) + ⌘K trigger + theme toggle + user menu (avatar dropdown).
- [x] Contextual sub-nav (`adapters/components/contextual-tabs.tsx`) — second header line that appears only on `/settings/*`, renders the section tabs inline. No vertical settings nav anywhere.
- [x] **Global ⌘K palette** (`adapters/components/command-palette.tsx`) — Navigate group (every page), Switch organization group (live org list with active marker + create new), Actions group (toggle theme, sign out). Cmd/Ctrl auto-detection.
- [x] **Org switcher** (`adapters/components/org-switcher.tsx`) — `Command`-powered popover with search. Active org pinned, Check icon. New-org link as the last item.
- [x] **User menu** (`adapters/components/user-menu.tsx`) — avatar dropdown with Account / Security shortcuts + destructive sign-out.
- [x] **`/settings` hub** — single layout (`features/settings/settings.layout.tsx`) renders `Outlet` with the contextual tabs as page nav. Six sub-pages: General, Members, Invitations, Billing (placeholder until Stripe ships), Profile, Security. `/settings` index redirects to `/settings/general`.
- [x] **One `<main>` per page** — the `Outlet` content wrapper is the page's `<main>` landmark. Sub-pages render plain divs/sections inside.
- [x] Custom inline-SVG `LogoMark` — two offset rounded squares (front solid, back at 18% opacity), theme-aware via `currentColor` + `var(--background)`. No asset file.

---

## Event-driven foundation — outbox + dispatcher + audit-log + webhooks ✅ May 2026

**Why**: every cloned SaaS needs the same event plumbing — outbox for at-least-once delivery, audit log for compliance (SOC2 §CC7.2 + ISO 27001), outbound webhooks for customer integrations, in-process handlers for side-effects. Building that rail once-for-all unlocks Phases A.4 (consent handlers), C.2 (audit), C.5 (webhooks), C.7 (SSO audit), D.3 (in-app notifs), 0.4 (observability subscribers) — each becomes a 1-line `onEvent(...)` declaration instead of a per-feature plumbing chunk.

**DX contract — zero plumbing post-clone**: a dev cloning the boilerplate writes (1) a 1-line entry in `packages/events/src/event-types.ts`, (2) `aggregate.addEvent(new XEvent(...))` in their domain method, (3) `this.uow.run(async tx => repo.save(agg, tx))` in their use-case. The outbox enqueue happens transparently via `AsyncLocalStorage` event collector + `IUnitOfWork.run()` flush pre-commit. Audit + webhook fan-out automatic if the event is in the retention map. In-process handlers via `onEvent(type, factory)` + 1 inwire `b.add(...)` are auto-discovered at boot (container introspection via `EVENT_HANDLER_SYMBOL` marker). See [`docs/EVENTS.md`](EVENTS.md) for the full DX guide.

### Catalog `@packages/events` (new private package)

- [x] **29 events at foundation** (grown to **35** as later phases added webhook-endpoint ×3, profile-updated + email-change-requested ×2, policy-accepted ×1) covering BetterAuth (user/session/account, organization/member/invitation, MFA/passkey), RGPD (deletion + export transitions), uploads (`hashKey` instead of raw filename for PII).
- [x] **Zod payload schemas** — typed discriminated union via `PayloadByEventType`.
- [x] **`RETENTION_MAP`** — per-event `operational` (90d) / `compliance` (7y) / `none`. The audit subscriber reads this directly — no glue.

### `@packages/ddd-kit` extensions

- [x] **`Aggregate.pullDomainEvents()`** — atomic pull-and-clear (replaces the old getter + `clearEvents()` pattern).
- [x] **`EventCollector`** (AsyncLocalStorage) — per-uow context isolation. Verified via concurrent `Promise.all` test.
- [x] **`IUnitOfWork.run(cb)`** standardized — wraps Drizzle `db.transaction(...)` + opens ALS context, drains events pre-COMMIT via injected `flushHandler`. **Nested `run()` interdit** — the impl throws `Error("nested IUnitOfWork.run() is not supported")` because Drizzle nested transactions are independent (not savepoints) → events would orphan. Detected via `EventCollector.hasContext()`.
- [x] **`onEvent(type, factory)`** + `EventHandler<T>` + `EVENT_HANDLER_SYMBOL` (cross-realm via `Symbol.for("clean-stack/event-handler")`). Inline-friendly: `b.add("X", onEvent(EventTypes.X, c => async e => c.IEmailService.send(...)))`.
- [x] **UUID v7 inline impl** (RFC 9562, no external dep) — replaces v4 in `UUID.create()`. Time-ordered → B-tree locality on insert. Monotonic across milliseconds; **not** strict intra-ms (acceptable for B-tree page-level locality, documented).
- [x] **`outbox-mapping.domainEventToOutboxRow()`** — converts `IDomainEvent` to outbox row shape with CloudEvents 1.0 metadata envelope (`specversion`, `source`, `subject`, `traceparent`, `datacontenttype`).

### `@packages/drizzle` schemas + run flush

- [x] **3 new schemas** — `outbox_event` (UUID v7 PK, partial index `WHERE dispatched_at IS NULL`, CloudEvents metadata jsonb), `audit_log` (5 indexes for filter combos, `prev_hash`/`hash` columns posed for tamper-evidence), `webhook_endpoint` + `webhook_delivery` (FK CASCADE org, FK RESTRICT outbox_event, idempotency_key UNIQUE, partial pending index).
- [x] **`TransactionService.run()`** — implements `IUnitOfWork.run` with `flushHandler` injected at construction time (container.ts wires it to `outbox.enqueue`). Sets `idle_in_transaction_session_timeout = '30s'` via `SET LOCAL` to protect against zombie workers.
- [x] **`trackEventsOnSuccess(result, aggregate)`** helper — repos call this in their `save`/`create` impl to push aggregate events into the ALS collector. Without it, events stay buffered on the aggregate and are silently lost.

### Shared infra

- [x] **`OutboxDispatcher`** (`apps/api/src/shared/services/outbox-dispatcher.service.ts`) — in-process Bun worker. Dedicated `pg.Client` for `LISTEN outbox_event` + reconnect with exponential backoff + 30s poll fallback. `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 50` drain (multi-instance ready). Built-in subscribers (audit + webhook fanout) run inside the dispatch TX (atomic with `markDispatched`); user `onEvent(...)` handlers run **post-commit** in a separate loop (best-effort, isolated). `pg_notify` trigger ensured idempotently at boot via `CREATE OR REPLACE TRIGGER` (Postgres 14+ atomic). Container introspection auto-wires user handlers via `Object.entries(di)` + `EVENT_HANDLER_SYMBOL` filter.
- [x] **Built-in subscribers** — `AuditEventSubscriber` writes audit row idempotently via deterministic ID `audit-${event.id}` (ON CONFLICT DO NOTHING). `WebhookFanoutSubscriber` enqueues `webhook_delivery` rows with `eventTypes ? <type>` ARRAY match AND `organizationId = event.organizationId`. **Multi-tenant safety**: events with `organizationId = null` (platform-level: USER_CREATED, USER_SIGNED_IN) skip the webhook fanout entirely — never broadcast across tenants. Verified runtime.
- [x] **AEAD secret crypto** (`shared/aead.ts`) — `@noble/ciphers` v2 XChaCha20-Poly1305 + HKDF-SHA256 per-org sub-key from `WEBHOOK_MASTER_KEY` (32-byte hex). Webhook secrets encrypted at rest, plaintext returned **once** at endpoint creation (Stripe-style).
- [x] **Decorrelated jitter** (`shared/jitter.ts`) — AWS Architecture Blog formula: `min(cap, random(base, lastDelay × 3))`. `BASE = 1000ms`, `CAP = 12h`, `MAX_ATTEMPTS = 5`. Retry paliers ~1m / 5m / 30m / 2h / 12h, dead-letter after 5 attempts.
- [x] **Ports** `IOutboxRepository` + `IAuditPort` in `shared/ports/`. Cross-cutting (consumed by 2+ contexts). Drizzle impls in `shared/services/`.
- [x] **`emitEvent(outbox, ...)` shared helper** (`shared/event-emitter.ts`) — used by BetterAuth bridge, RGPD service, UploadService instead of duplicated private `emit` methods.
- [x] **Request correlation via `AsyncLocalStorage`** (`shared/request-context.ts`, Jun 2026) — a `requestId` middleware wraps each request in an ALS carrying its `X-Request-Id`; `DrizzleOutboxRepository.enqueue` reads it at the single write choke-point and stamps `outbox_event.metadata.requestId`, which the `AuditEventSubscriber` copies into `audit_log.request_id`. Chosen over threading `c.get("requestId")` through ~30 call sites because BetterAuth hooks (which emit the majority of events) have no Hono `c` in scope — ALS is the only source that covers Hono routes, BetterAuth lifecycle hooks, and the internal-route cron alike. The actor stays explicit per rule §7 (ALS is for observability only, never authz).
- [x] **Service-level audit via `emitEvent` → `AuditEventSubscriber`** — code without an aggregate (RGPD, uploads, BetterAuth bridge) emits its event through the `emitEvent` helper; the subscriber writes the `audit_log` row from the outbox. The outbox event *is* the audit primitive — there is no separate `recordAudit` helper.

### BetterAuth bridge (`apps/api/src/auth.ts`) — 21 unique events emitted automatically (23 emit sites; USER_PASSWORD_CHANGED + ORG_MEMBER_JOINED each have 2)

3 voies SOTA combinées :

- **`databaseHooks`** (TX-bound, captures all flows including non-HTTP) — USER_CREATED (`user.create.after`), USER_SIGNED_IN (`session.create.after`), USER_SIGNED_OUT (`session.delete.after`), USER_ACCOUNT_UNLINKED (`account.delete.after`, skip credential).
- **`hooks.after` + `createAuthMiddleware`** (path-based, plugin events not exposed in `databaseHooks`) — filter `if (ctx.context.returned instanceof APIError) return` to skip on 4xx/5xx (plugin events fire even on errors otherwise). Paths: `/two-factor/{enable,disable}`, `/passkey/verify-registration` (lookup latest passkey for userId), `/passkey/delete-passkey` (body.id), `/verify-email`, `/change-password`, `/link-social` (lookup latest non-credential account < 5s ago to avoid re-link false-positives).
- **Native callbacks** — `emailAndPassword.{sendResetPassword,onPasswordReset}` (USER_PASSWORD_RESET_REQUESTED + USER_PASSWORD_CHANGED), `magicLink.sendMagicLink` (USER_MAGIC_LINK_REQUESTED).
- **`organizationHooks`** (org plugin) — afterCreateOrganization (ORG_CREATED), afterUpdateOrganization, afterDeleteOrganization, afterAddMember + **afterAcceptInvitation** (both emit ORG_MEMBER_JOINED — the two lifecycles are independent in BetterAuth, missing the second drops every member who joins via invite), afterRemoveMember, afterUpdateMemberRole, afterCreateInvitation (ORG_MEMBER_INVITED), afterCancelInvitation.
- **RGPD service** — USER_DELETION_{REQUESTED,CANCELLED}, USER_DELETED, USER_EXPORT_{REQUESTED,COMPLETED} (payload: `storageKey`, **never** the presigned URL — security).
- **UploadService** — UPLOAD_REQUESTED + UPLOAD_CONFIRMED + UPLOAD_DELETED (`DELETE /uploads`, ownership-gated by `key.startsWith(\`${ownerId}/\`)`; payload: `hashKey(key)` sha256-truncated, **never** the raw filename — PII).
- Race window BetterAuth COMMIT ↔ outbox enqueue documented as accepted (no 2PC available). For SOC2 reconciliation: cron `SELECT u.id FROM "user" u LEFT JOIN outbox_event o ON o.aggregate_id = u.id AND o.event_type = 'user.created' WHERE o.id IS NULL`.

### Built-in modules

- [x] **`modules/audit-log/`** — `AuditQueryService.listForOrg(orgId, filters)` (orgId always from session, never query string), `GET /admin/audit-log` (gated `requireOrgPermission({ auditLog: ["read"] })`), `POST /internal/audit-log-purge` (cron sweep operational rows).
- [x] **`modules/webhooks/`** — full CRUD `/settings/webhooks` (gated `requireOrgPermission({ webhooks: ["read"|"write"] })`), `WebhookDeliveryWorker` with **claim window pattern** (claim batch with `next_attempt_at = now() + (BATCH_SIZE × FETCH_TIMEOUT + 30s)`, fetch HTTP outside TX, update status in fresh TX) — prevents lock starvation under sustained load. HMAC signing format `t=<unix>,v1=<hex-sha256>` (Stripe-style), header `x-webhook-signature`. Idempotency-key `<eventId>:<endpointId>` (UNIQUE). Replay endpoint creates fresh delivery row.

### Lifecycle

- [x] **Boot** — `OutboxDispatcher.start(di)` + `WebhookDeliveryWorker.start()` in `apps/api/src/index.ts`. `EventCollector.setOutOfContextLogger` wired to pino warn (DX: events emitted outside `uow.run()` log a warning instead of disappearing silently).
- [x] **SIGTERM/SIGINT** — `Promise.all([stopWithTimeout(webhookWorker), stopWithTimeout(outboxDispatcher)])` parallel shutdown (each worker has 25s timeout, fits in K8s 30s `terminationGracePeriodSeconds`).

### Permissions

- [x] **`@packages/access-control`** extended — `auditLog: ["read"]` and `webhooks: ["read","write"]` added to `STATEMENTS`. Owner + admin get both, member gets neither.

### Tests + smoke runtime

- [x] **Unit tests** — `event-collector.test.ts` (ALS isolation between concurrent contexts), `aggregate.test.ts` (`pullDomainEvents` atomic), `jitter.test.ts` (bounds + dead-letter math), `aead.test.ts` (encrypt/decrypt round-trip + sub-key determinism + ciphertext tampering rejection), `hmac-signer.test.ts` (Stripe-format signature + verify round-trip + stale timestamp window).
- [x] **Smoke runtime** — signup via `/api/auth/sign-up/email` → `outbox_event` row dispatched in <1s → `audit_log` row written with `audit-${eventId}` deterministic ID + retention compliance + extractActor heuristic OK. Endpoint registration → `org.updated` trigger → `webhook_delivery` row created + delivery attempt fail (URL fake) + retry attempts=2 (decorrelated jitter in action). Multi-tenant: events with `organizationId = null` skip fanout (verified).

### Decisions clés (non-obvious, locked-in by code)

1. **`databaseHooks` for core models, `hooks.after` for plugin events** — confirmed by reading BetterAuth v1.6.9 source (Context7). Plugin tables (`twoFactor`, `passkey`) not exposed in `databaseHooks`. `hooks.after` requires `APIError` instance check (not `"error" in returned` — that pattern misses APIError instances thrown by handlers).
2. **Built-in subscribers (audit + webhook fanout) run inside dispatch TX, user handlers run post-commit** — atomic for the rail, best-effort for handlers. A user handler throwing doesn't fail `markDispatched`. A built-in subscriber throwing rolls back the entire batch (retried at next drain).
3. **No nested `IUnitOfWork.run`** — Drizzle nested `db.transaction()` opens independent TXs (not savepoints). Events from inner `run` would persist in outbox even if outer rolls back (orphan). Hard guard via `EventCollector.hasContext()` throw.
4. **`organizationId = null` skips webhook fanout** — platform-level events (USER_CREATED, USER_SIGNED_IN) emit without an org context. Without this skip, cross-tenant data leak (every tenant's webhook receives every signup of every other tenant).
5. **AEAD secret stored, plaintext returned once** — Stripe pattern. Master key `WEBHOOK_MASTER_KEY` (32 hex bytes) required at boot in production (env validation throws). Per-org sub-key via `HKDF-SHA256(masterKey, salt: undefined, info: "webhook-secret:${orgId}")`.
6. **Claim window pattern in delivery worker** — fetch HTTP outside TX (otherwise 50 deliveries × 30s timeout = 25min TX, kills connection pool). Claim window = `BATCH_SIZE × FETCH_TIMEOUT + 30s buffer`. Idempotency-key on receiver side prevents double-POST if worker crashes mid-fetch.
7. **`hashKey(rawKey)` in UPLOAD events** — sha256-truncated to 16 chars. Raw filename stays only in S3 + the user's session (never in audit_log/webhooks). PII compliance.
8. **`onPasswordReset` + `/change-password` both emit `USER_PASSWORD_CHANGED`** — different flows (reset via email vs. logged-in change), single event type. Receiver dedupes if needed.
9. **Tamper-evidence deferred** — `prev_hash`/`hash` columns posed in `audit_log`, calc gated by `AUDIT_TAMPER_EVIDENCE` env flag (off). Implementation choice (Merkle batch vs. row-lock hash chain) parked until SOC2 audit demands.
10. **3 rounds of multi-agent review** — round 1 found 20 issues fixed, round 2 found 13 issues (3 invalidated round 1 fixes, fixed), round 3 found 1 HIGH (`stopWithTimeout` séquentiel → `Promise.all`) + 1 MEDIUM (`break` on stopping in post-commit loop) fixed. Smoke runtime then validated end-to-end.
11. **End-to-end QA pass found 2 real bugs + drove the ORM-first rule.** A 36-test harness exercising every event via real HTTP (signup → outbox → audit_log → webhook_delivery → HMAC-signed POST received) caught: (a) `ORG_MEMBER_JOINED` silently missing on `acceptInvitation` because BetterAuth routes it through `organizationHooks.afterAcceptInvitation` — a separate lifecycle from `afterAddMember` (which only fires for direct adds, not invites); (b) `UPLOAD_DELETED` declared in the catalog but never emitted (orphan event). Both fixed: dual-hook wiring + `DELETE /uploads` route with ownership guard. Then the same QA pass exposed several `sql\`...\`` raw fragments in services where Drizzle has typed helpers (`arrayContains`, `isNull`, `inArray`, `.for("update", { skipLocked: true })`) — codified as **cross-cutting rule #5** (ORM-first; raw SQL only for what the ORM doesn't model: DDL, `SET LOCAL`, server `now()`, atomic `${col} + 1` per Drizzle docs). 8 conversions, 4 raw fragments justified, all type-safe column refs preserved.
12. **`emitEvent` tx-aware + drop swallowing catch (post-merge hardening, May 2026).** Original service-level `emitEvent` (used by code outside an aggregate: rgpd, uploads, BetterAuth bridge) opened its own autonomous TX for the outbox INSERT and wrapped the call in `catch + logger.error`. Two gaps: (a) state change and event emission were not atomic when the caller already had a TX, so an outbox failure could leave the row mutated without its event — silent audit/webhook gap; (b) callers couldn't react to enqueue failures (silently swallowed). Fix: optional `tx?: Transaction` arg propagated to `outbox.enqueue`, catch removed. Rgpd writes that ship state-change events (`requestAccountDeletion`, `cancelAccountDeletion`, `executeAccountWipe` migrated `startTransaction → run`, `requestDataExport` for the `_COMPLETED` event) now wrap in `uow.run` and pass the TX. Upload service and `auth.ts` BetterAuth bridge stay autonomous (no local DB write, hooks don't expose a `Transaction`) — documented limitation.
13. **`docs/EVENT_PIPELINE.md` — pedagogical complement to EVENTS.md.** Visual walkthrough (the dual-write problem, 4-phase flow diagram, LISTEN/NOTIFY explained, two-tier delivery, failure modes, SKIP LOCKED concurrency model). EVENTS.md remains the DX guide (how to declare events, register handlers, retention map, deploy).
14. **Retention sweeps (Phase 0.6, May 2026).** Three HMAC-gated `/internal/sweep-*` routes purge the derived pipeline tables (`outbox_event` / `audit_log` / `webhook_delivery`) — closes the only remaining unbounded-growth gap of the event pipeline. SOTA 2026 defaults validated by parallel research (NServiceBus/Debezium for outbox, SOC2/PCI/NIS2 for audit, Stripe/GitHub/Hookdeck for webhook): `OUTBOX_RETENTION_DAYS=7`, `AUDIT_LOG_OPERATIONAL_RETENTION_DAYS=90`, `AUDIT_LOG_COMPLIANCE_RETENTION_DAYS=365`, `WEBHOOK_DELIVERY_RETENTION_DAYS=30`. Batch pattern `DELETE WHERE id IN (SELECT … LIMIT 5000 FOR UPDATE SKIP LOCKED)` + `SET LOCAL statement_timeout/lock_timeout/idle_in_transaction_session_timeout` in a Drizzle transaction. Cron order matters (FK `ON DELETE RESTRICT`): webhook → audit → outbox. **Legacy `/internal/audit-log-purge` retired** — `sweep-audit-log` is a strict superset (both buckets, env-driven). Rule §6 (every state change emits an event) gained an **explicit exception** for infra retention sweeps — the business event was already emitted at write time, the sweep deletes its own audit row. Tests reduced to HMAC-gating (401) — `mock.module("@packages/drizzle")` leaks across parallel `bun test` files, so the cross-bucket mock was made the superset (anti-pattern documented in `apps/api/src/shared/CLAUDE.md`).

---

## Observability — Sentry with IInstrumentation port ✅ Phase 0.4 · May 2026

**Why**: errors silently swallowed in `catch + Result.fail(...)` blocks were the #1 source of "no idea why it broke in prod" in the boilerplate. SOC2 §CC7.3 + ISO 27001 A.16.1 require monitored incident detection — without an error-tracking rail the cloneur had to retrofit Sentry per-service. The SOTA-2026 audit landed on **Sentry only**: OTel sub-Bun 1.3+ requires manual `Bun.serve()` instrumentation and Prometheus `/metrics` is dead code until a Grafana consumer exists.

**Pattern (Lazar-inspired, port-first)**: single `IInstrumentation` port (`startSpan` + `capture` + `addBreadcrumb`) injected via inwire DI. `NoOpInstrumentation` by default, `SentryInstrumentation` swaps in when `SENTRY_DSN` is set — single binding flip in `container.ts`, zero refactor at call sites. Every I/O class (repos, S3, Resend, subscribers, dispatcher, workers) receives the port via constructor and follows the same shape: outer span per public method, inner span per `query.execute()` / `fetch()` / `client.send()` (with OTel SemConv 1.27+ attributes `db.system.name: "postgresql"` + `op: db.query` / `db.transaction` / `http.client` / `function`), catch + capture + return-or-rethrow.

- [x] **`apps/api/src/shared/ports/instrumentation.port.ts`** — single 30-line port. No `Result<>` (telemetry is fire-and-forget, never blocking). Sentry SDK init via side-effect `import "./shared/services/sentry-init"` as the first line of `index.ts` (hooks async-hooks before pino/Hono/Drizzle attach).
- [x] **Pino → Sentry breadcrumb bridge** via `Sentry.pinoIntegration()` (SDK v10.18+ native, replaces deprecated `@sentry/pino-transport`).
- [x] **`beforeSend` scrub whitelist** — drops `email`, `username`, `ip_address`, `cookie/Cookie`, `authorization/Authorization`, `x-csrf-token`, `query_string`, `data`. Preserves innocent headers (`content-type`). RGPD-clean by default + `sendDefaultPii: false`. Sentry UI Data Scrubber (Settings → Security & Privacy) documented as defense-in-depth.
- [x] **Front (`@sentry/react`)** — `Sentry.ErrorBoundary` wraps the router with shadcn `AppErrorFallback`, React 19 `createRoot` receives `onUncaughtError` / `onCaughtError` / `onRecoverableError` handlers from `Sentry.reactErrorHandler()`. `@sentry/vite-plugin` gated on `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` (CI-only); `sourcemap: "hidden"` (uploadable but not view-source leakable).
- [x] **154 tests** — every repo / service / subscriber / worker covered. Mocks of `@packages/drizzle` + `@packages/events` expose the **complete superset** of exports in every file (bun:test `mock.module` leaks globally → partial mocks surface as `SyntaxError: Export named 'X' not found` in unrelated parallel test files). Anti-pattern documented in `apps/api/src/shared/CLAUDE.md`.
- [x] **`docs/OBSERVABILITY.md`** — full doc: port usage, Lazar instrumentation pattern (outer/inner span), removability runbook (5 steps: trash module + remove `.addModule()` + unset DSN = NoOp everywhere, zero refactor), provider swap recipe (Sentry → GlitchTip self-hosted, drop-in DSN), Sentry UI scrubber, **deferred section** (OTel + Prometheus + Session Replay + `tracesSampleRate>0` all wait for Phase D.1 Grafana consumer).
- [x] **Root rule §8** — "Every I/O method declares a span; every catch surfaces the error to telemetry." Omnipotent rule with `Test before merging`: every public I/O method calls `this.instrumentation.startSpan(...)` or has a documented reason not to (multi-query exception like `executeWipe`).

### Decisions (Phase 0.4)

1. **Single merged port** (vs Lazar's two separate `IInstrumentationService` + `ICrashReporterService`). Justification: in this codebase both surfaces consume the same `Sentry` global, splitting forces double-wiring at every call site for zero portability gain.
2. **Sentry-only, OTel + Prometheus deferred to D.1.** Bun OTel auto-instrumentation requires manual `Bun.serve()` wiring (not stable until Bun 1.4); `prom-client` without Grafana scrape = code mort. Same anti-NIH principle as Phase 0.3: ship infra cross-cutting only when a consumer exists.
3. **`SentryInstrumentation` constructor-injected, NOT module-level singleton.** Mirrors the `IEmailService` / `IStorageService` pattern; respects the "no service-locator" rule. Sentry SDK *init* remains a side-effect import (the SDK detains global state — wrapping that init would just recopy `Sentry.*` and lose typings).
4. **`createErrorHandler(instrumentation)` factory pattern for `error.middleware`.** Middlewares importing `di` directly from `container.ts` would risk a runtime cycle if any module imported back into `shared/middleware/`. Factory takes the dep as a parameter, called once in `index.ts` after `di.build()` — cycle-immune.
5. **NoOp + Sentry surfaces stay symmetric.** `apps/app/src/shared/observability/{noop,sentry}.ts` export identical signatures (`captureError`, `addBreadcrumb`, `ErrorBoundary`, `reactErrorHandler`). `noop.ts` listed as `knip` entry so it never goes stale. Swap = single import path change; no runtime alias gymnastics.

---

## Disaster recovery — PITR-first, doc-only deliverable ✅ Phase 0.3 · May 2026

**Why**: SOC2 §A.1 + ISO 27001 A.12.3 require a tested backup/restore policy. clean-stack had none — a cloneur in prod had to improvise. The original roadmap entry expected a `pg_dump` cron route in the API; SOTA 2026 audit reversed that decision.

**Why no code shipped**: SOTA-2026 closed the case. Every managed Postgres provider (Railway, Neon, Supabase, AWS RDS, Fly) ships PITR one-click with sub-minute RPO and 7–35 d retention. [`pgBackRest` lost its maintainer in 2026](https://thebuild.com/blog/2026/04/30/after-pgbackrest/) — building a clean-stack route on top would have been a regression. A custom `/internal/backup-postgres` would duplicate what the platform already does (provider snapshots), force `postgresql-client` into the Docker image, and introduce streaming/OOM/timeout failure modes that the cloneur would inherit for zero value. clean-stack ships *cross-cutting multi-tenant infrastructure* (audit, webhooks, RGPD, observability) — backup is infra DB, owned by the provider.

- [x] **`docs/DISASTER-RECOVERY.md`** — full DR doc covering: RPO/RTO targets (1–5 min PITR / 7 d fallback), 3-2-1 rule applied to a clean-stack deployment, restore runbook (provision ephemeral target → download → restore → smoke-check inline `psql count(*)` script → roll-forward vs in-place vs side decision tree).
- [x] **PITR setup per provider** — short pointers for Railway (add-on), Neon (branch-based, sub-second), Supabase (add-on, 7 d granularity), AWS RDS (automated, 35 d max), Fly volume snapshots, self-hosted WAL-G (`pgBackRest` flagged unmaintained, Barman as alternative).
- [x] **Weekly portable `pg_dump` export** — copy-paste recipes for GitHub Actions, Railway Cron, and K8s CronJob. Streams `pg_dump | gzip | aws s3 cp -` (no OOM, multipart auto via AWS CLI). Targets `backups/postgres/<ISO>.sql.gz` in the existing S3 bucket — no dedicated bucket required. **Read-only Postgres role** mandated per CI-secret-leak best practice.
- [x] **Monthly automated restore-test** — GitHub Actions workflow recipe: spawns `services.postgres:17-alpine` on port `5436`, downloads latest dump, restores via `gunzip | psql`, runs inline `psql count(*)` smoke per table, fails loud.
- [x] **Lifecycle + versioning snippets** — `aws s3api put-bucket-lifecycle-configuration` (expire weekly exports 30 d, transition monthly snapshots `STANDARD → GLACIER` 1 y), `aws s3api put-bucket-versioning Status=Enabled`, MFA-delete note. Caveats: Cloudflare R2 has no GLACIER class (use `STANDARD_IA`), SeaweedFS lifecycle/versioning partial depending on version.
- [x] **README + CRON.md updates** — README `## Deployment` links to `DISASTER-RECOVERY.md` alongside `HEALTH-PROBES.md`. CRON.md adds a "Not an internal endpoint" section pointing at the DR doc, to prevent future contributors from re-litigating the "should we add `POST /internal/backup-postgres`" question.

### Decisions (Phase 0.3)

1. **Doc-only.** No route, no script, no Docker image change. SOTA-2026 (Pettus "After pgBackRest", WAL-G K8s guide, provider PITR comparisons) made the boilerplate-side code obsolete before it was written. Encoded as the **anti-NIH default** for infra layers a provider already owns — applies to Phase 0.4 candidates too (don't ship code that competes with Sentry/Grafana SaaS one-click setup; ship NoOp adapters that *swap to* those services).
2. **`backups/postgres/` prefix in the existing S3 bucket**, not a dedicated `R2_BACKUP_BUCKET`. Trade-off accepted: lifecycle policy + delete-protection apply to the whole bucket, slightly less SOC2-friendly. Justification: simpler ops, no extra env var for the cloneur, and the lifecycle filter (`Prefix: "backups/postgres/"`) still isolates the expiry rule.
3. **Read-only Postgres role for the export job**, not the API role. CI-secret-leak best practice: `pg_dump` only needs `GRANT CONNECT, USAGE, SELECT`. Documented in the doc itself rather than as a separate runbook — the YAML recipe links its `secrets.DATABASE_URL` to "a read-only role" inline.
4. **No `pnpm db:smoke` script committed.** The verification step (`select count(*) per table`) is a 15-line inline snippet in the doc; the cloneur drops it in `apps/api/scripts/db-smoke.ts` if they want to keep it. Adding it to the boilerplate would couple to a specific schema enumeration that drifts on every domain change — the doc instead shows how to iterate from Drizzle's exported `schema` namespace, which doesn't drift.
5. **No GitHub Actions workflow committed.** Same rationale as `docs/CRON.md` § Wiring: clean-stack ships the recipes, the cloneur picks the scheduler. Committing `.github/workflows/postgres-export.yml` would silently fire on every fork without secrets — bad UX. Documented YAML stays inert until copied.

---

## Health probes — `/livez` · `/readyz` · `/startupz` ✅ Phase 0.2

**Why**: K8s / Railway / Fly / Render all probe liveness/readiness/startup; absence = restart loops + 502s during deploys. SOTA 2026 = three probes, IETF `draft-inadarei` response format, graceful shutdown wired to `/readyz`. Full per-PaaS recipes in [`docs/HEALTH-PROBES.md`](HEALTH-PROBES.md).

- [x] `modules/health/` vertical slice + `IHealthCheckRegistry` (`shared/ports/health.port.ts`). Each infra-owning module ships an `XxxHealthProbe implements OnInit` that self-registers at `di.preload()` — `trash` the module removes its probe in one shot, no orphan.
- [x] `/livez` liveness, **no dependency hit** (a DB outage must not restart pods → thundering herd). `/readyz` aggregates checks (db `SELECT 1` critical, storage `HeadBucket` non-critical), tri-state `pass`/`warn`/`fail` → 200 unless a critical check fails (503). `/startupz` shields a slow boot from a tight liveness threshold.
- [x] Asymmetric cache (positive 30s / negative 5s) + self-cancelling 5s timeout on `/readyz`. Mounted **outside** requestId/httpLogger/cors/session middleware (probes carry no cookies; ~17k hits/day/pod would drown logs).
- [x] **Graceful shutdown** — `SIGTERM` flips `lifecycleState` → `/readyz` returns 503 within one probe interval (LB drains), waits `SHUTDOWN_GRACE_PERIOD_MS` (15s default), then stops the workers. Without it: intermittent 502s on every deploy.
- [x] **Prod-validation hardening (Jun 2026)** — `/livez` + `/startupz` payloads trimmed to `{status, uptimeMs}`; build metadata (`version`/`commitSha`/`runtime`) moved behind `/internal/build-info` (HMAC-gated). Public probes were an info-disclosure vector (version fingerprinting + exact-source mapping for private clones). See the Railway closeout below.

---

## Removability dry-run — first leaf removed end-to-end ✅ Phase 0.5 · May 2026

**Why**: the vertical-slice contract claims "a leaf feature is removable in 5 minutes". Until one was actually removed end-to-end, that was theory. Runbook + worked example + edge cases in [`docs/REMOVABILITY.md`](REMOVABILITY.md).

- [x] Removed `modules/rgpd` end-to-end in a throwaway worktree: **46 files touched, −2980 LOC net**, 3 `DROP COLUMN` migration. All 6 gates green (`type-check`, `ci:check`, `check:unused`, `check:duplication`, `build`, `test` baseline-preserving).
- [x] **4 surprises captured** — a 3rd RGPD column missed by the initial cartography, a transitively-dead `throwApiError` helper, a dangling knip pattern, pre-existing test fails unrelated to the removal. Contract holds: TS error-points the rest.
- [x] **6-axis checklist** codified (schema barrel, DI `.addModule()` + `app.route()`, access-control statements, front nav, email templates) — the canonical "how to remove a feature".

---

## Railway reference deploy — config-as-code SOTA 2026 ✅ Phase 0.7 · May 2026

**Why**: clean-stack mentionnait Railway dans 3 docs (`HEALTH-PROBES.md`, `DISASTER-RECOVERY.md`, `EVENTS.md`) mais aucun cloneur n'avait jamais validé le boilerplate de bout en bout. Le projet Railway existant tombait sur Nixpacks par défaut (pas de `railway.toml`) et ne savait pas piloter le monorepo pnpm + Bun. Phase 0 ne pouvait pas être fermée avec ce gap.

**Why SOTA 2026 décidé après recherche** (sources docs.railway.com 2026) : pattern monorepo "shared root" — tous les services pointent `rootDirectory = /` (build context = repo root pour résoudre `packages/`), chacun a un **custom config file path** (`infra/railway/<service>.toml`). Format TOML (lisibilité > JSON pour edit humain). `cronSchedule` natif dans `deploy` block (vs service séparé pré-2025). Reference Variables (`${{shared.NAME}}`, `${{Postgres.DATABASE_URL}}`) pour secrets cross-service — jamais dupliqués.

- [x] **`infra/railway/{api,app,cron}.toml`** — 3 services pinés au schéma officiel (`"$schema" = "https://railway.com/railway.schema.json"`). api : `healthcheckPath = "/livez"`, `restartPolicyType = "ON_FAILURE"`, `numReplicas = 1`. app : `healthcheckPath = "/health"` (Caddy), 0 réplicas extra. cron : `cronSchedule = "17 3 * * *"`, `startCommand = "bun dist/cron/sweep.js"`, `restartPolicyType = "NEVER"`. Tous : `watchPatterns` scopés pour éviter les rebuilds inutiles (api ne se redéploie pas quand seul `apps/app/` change).
- [x] **`apps/api/src/cron/sweep.ts`** — chaîneur des 3 sweeps dans l'ordre FK (webhook → audit → outbox) via `signedInternalFetch` (object input — la signature outdated dans `docs/EVENTS.md` qui utilisait 3 args positionnels est corrigée du même coup). Lit `API_URL` et `INTERNAL_SIGNING_KEY` de l'env, `process.exit(1)` au premier non-2xx. Bundle entrypoint ajouté à `bun build` aux côtés de `index.ts`+`migrate.ts` → `dist/cron/sweep.js`. Le service cron Railway réutilise l'image api (single Dockerfile, single source de vérité) — pas de nouveau `cron.Dockerfile`.
- [x] **Fix in-scope `apps/api/prod.Dockerfile` + `apps/app/prod.Dockerfile`** — 2 bugs latents qui auraient mordu en prod : (a) `HEALTHCHECK` api pointait `/health` (n'existe pas — le boilerplate utilise IETF `/livez` depuis Phase 0.2). Railway utilise son propre healthcheck via `healthcheckPath` du `.toml` donc le bug ne bloquait pas le deploy Railway, mais Docker local marquait le conteneur unhealthy à tort et tout autre orchestrateur (Fly, K8s) aurait souffert. (b) `RUN pnpm --filter "@packages/*" run build` retiré des deux Dockerfile — viole rule §4 ("internal packages ship source"). Seul `ddd-kit` a un script `build` (pour publication npm future), inutile en monorepo : Bun's bundler résout les exports `src/index.ts` directement. La ligne faisait du compute wasted et risquait de produire un `dist/` qui shadow le src.
- [x] **`apps/api/.env.example` audité** — markers `# REQUIRED IN PROD` sur les vars critiques (`DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `CORS_ORIGIN`, `APP_URL`, `RESEND_*`, `INTERNAL_*`, `WEBHOOK_MASTER_KEY`, `S3_*`, `SENTRY_*`, `GIT_SHA`, `BUILD_TIME`, `API_URL` côté cron). Source de vérité unique pour la sync vers Railway Shared Variables — la table de mapping dans `DEPLOY-RAILWAY.md` réfère ce fichier.
- [x] **Pas de `.github/workflows/deploy.yml`** — Railway watch `main` nativement via l'intégration GitHub + `watchPatterns` par service scope les rebuilds. Pas besoin de webhook GH Actions (1ère itération en avait un, retiré après audit : risque double-deploy, ajoute des secrets GH inutiles, viole le principe single-source). `GIT_SHA`/`BUILD_TIME` injectés via Reference Variables Railway (`${{RAILWAY_GIT_COMMIT_SHA}}`/`${{RAILWAY_GIT_COMMIT_MESSAGE}}`).
- [x] **`docs/DEPLOY-RAILWAY.md`** — runbook complet (12 sections) : setup projet + Postgres add-on EU + création des 3 services (root dir `/` + config-as-code path par service) + Shared Variables (table de génération `openssl rand ...`) + per-service Variables (api/app/cron avec Reference Variables) + R2 setup par défaut (jurisdiction EU, lifecycle `tmp/` 30j + `backups/` 365j aligné DISASTER-RECOVERY, API token scopé) + alternative Railway Bucket (calcul comparatif coût 5GB/50K writes/500K reads/20GB egress — R2 gagne sur free tier + zero egress, Railway Bucket facture egress service→bucket sur réseau public) + Resend + Sentry + custom domains + first deploy (Railway watch auto, pas de plumbing GH Actions) + smoke-test 6 étapes (sign-up→email→org→upload R2→RGPD outbox+audit→Sentry release) + removability runbook vers Fly/Render/Cloud Run (Dockerfile + sweep.ts entrypoint portables) + troubleshooting matrix.
- [x] **`docs/EVENTS.md` cron recipe nettoyé** — section "GitHub Actions example" supprimée (user veut Railway Cron exclusif sur le boilerplate déployé). Remplacée par pointer vers `apps/api/src/cron/sweep.ts` comme entrypoint canonique, doc des autres orchestrateurs en one-liner (Fly Machines `--schedule`, Render Cron Job, K8s CronJob, Cloud Scheduler) — la signature primitive est platform-agnostic. `docs/CRON.md` ligne 164 mise à jour pour pointer vers Railway Cron + entrypoint.
- [x] **ROADMAP.md** — 0.7 passé en DONE avec résumé complet. 0.6 entry mise à jour pour refléter le déplacement de l'entrypoint cron du recipe inline vers `apps/api/src/cron/sweep.ts`.

### Decisions (Phase 0.7)

1. **Single-source cron : Railway Cron uniquement, pas de fallback GH Actions.** Décision user explicite après la première itération du plan qui proposait les deux. Justification : le boilerplate prescrit Railway pour le reference deploy, multiplier les chemins de cron = noise (double-purge harmless mais log noise + risque de désync) et invite le cloneur à hésiter. Si un cloneur veut un autre scheduler, le runbook documente le swap. `.github/workflows/sweep.yml` jamais commit ; `docs/CRON.md` reste scheduler-agnostic au niveau philosophique (Railway Cron + K8s + Inngest comme wiring options) — l'asymétrie est intentionnelle : doc générique vs ship config concrète.
2. **Storage : Cloudflare R2 par défaut, Railway Bucket en alternative documentée.** R2 free tier 10 GB + zero egress + $0.36-$4.50/1M ops > Railway Bucket pour un boilerplate. Le piège Railway Bucket : egress service→bucket facturé (réseau public, pas privé) — invisible dans la pricing page Railway, calculé inline dans le runbook. User a posé la question coût en cours de plan : la réponse "R2 reste moins cher même quand tu paies déjà Railway" a été chiffrée + documentée.
3. **Cron service réutilise l'image api, pas de Dockerfile dédié.** Single source of truth pour le binary qui parle au pipeline d'événements. Le `startCommand` override + `cronSchedule` suffisent — Railway Cron est un type de service ordinaire avec ces 2 deltas. Alternative envisagée : `apps/cron/Dockerfile` séparé — rejetée car duplique pnpm install + bun build pour zéro gain (et drift entre les deux images au prochain bump de version).
4. **Custom config file path en dashboard, pas multiple `railway.toml` à la racine.** Railway 2026 ne supporte qu'un seul `railway.toml` par service-root. Pour partager le build context (= repo root, requis pour `packages/`), seule option = `rootDirectory = /` pour les 3 services + 3 chemins de config différents dans le dashboard. Pas reproductible via fichier seul (le dashboard setting reste manuel) — documenté en étape 1 du runbook.
5. **Pas de `preDeployCommand` pour la migration (Railway-spécifique).** Garde le pattern `CMD migrate && start` portable (marche sur Fly, K8s, Cloud Run sans modif). `preDeployCommand` est une optimisation Railway (1 migration par deploy au lieu d'1 par restart de container) — vaut le coup quand la suite scale > 5 réplicas ; sur 1 réplique le cost est nul. Defer to operational phase.
6. **Pas de `numReplicas = 1` explicite.** Première itération avait `numReplicas = 1` dans `[deploy]` — invalid : ce champ n'existe que sous `[deploy.multiRegionConfig.<region>]` (Railway docs 2026). Retiré ; default Railway = 1 réplique implicitement.
7. **Pas de GH Actions deploy workflow.** Railway watch `main` nativement + `watchPatterns` par service = zero glue nécessaire. Première itération avait un `.github/workflows/deploy.yml` matrix qui hit les Deploy Webhooks Railway — retiré après audit (double-deploy avec le watch natif, secrets GH supplémentaires, viole single-source). Le pattern webhook reste utile pour deploys cross-service ordonnés (defer si jamais nécessaire en phase opérationnelle).


---

## Right to rectification (Art. 16) + NIST 800-63B-4 ✅ Phase A.1 · Jun 2026

**Why**: two non-negotiables bundled in one push. Art. 16 GDPR requires a working edit-profile surface (BetterAuth back-end already supports it; the boilerplate only exposed disabled placeholders). NIST SP 800-63B-4 final (August 2025) is the SOTA password baseline — minimum length 15, HIBP breach screening, no complexity rules. Both touch the same surface (`/settings/account` + auth flows); shipping together avoids a second round-trip.

### Back-end

- [x] **`user.profile.updated`** event (`USER_PROFILE_UPDATED`, retention `compliance`) — emitted in `auth.ts` via `hooks.after` on path `/update-user`. Payload: `{ userId, changes }` (field-level diff).
- [x] **`user.email.change_requested`** event (`USER_EMAIL_CHANGE_REQUESTED`, retention `compliance`) — emitted in the `user.changeEmail.sendChangeEmailConfirmation` callback. Payload: `{ userId, newEmail }`.
- [x] **`IPasswordBreachService` port** (`shared/ports/password-breach.port.ts`) + **`HibpPasswordBreachService`** impl (`shared/services/`) — HIBP k-anonymity (`api.pwnedpasswords.com/range/<sha1[:5]>`, `Add-Padding` header, timeout `HIBP_TIMEOUT_MS` default 3000 ms). Instrumented (span `http.client`). **Fail-open** on network error — breach check failure is captured and logged but never blocks the user.
- [x] **`findPasswordViolation()` + `validatePassword()` helpers** (`shared/password-policy.ts`) — pure, unit-testable. `findPasswordViolation` bans email-local-part, display name, and app name (`clean-stack` / `cleanstack`). `validatePassword` adds the length-guard (skips HIBP below `MIN_PASSWORD_LENGTH`) then the breach check, returning the first violation or `null`. The inline ~20 common-password list was dropped — HIBP already covers every common password, so it was dead weight.
- [x] **`auth.ts` changes** — `emailAndPassword.minPasswordLength: MIN_PASSWORD_LENGTH`; `hooks.before` calls `validatePassword(...)` on `/sign-up/email`, `/reset-password`, `/change-password` (throws `APIError` 422 on violation); `user.changeEmail.enabled: true` + confirmation sent to the **current** address (not the new one) + `change_email` email template; `databaseHooks.user.update.after` clears `pendingEmail` and emits `user.profile.updated { changes: { email } }` once the new address becomes effective.
- [x] **`pendingEmail` field** — nullable `pending_email` column (`packages/drizzle/src/schema/auth.ts`, migration `0004`) exposed as a BetterAuth additionalField (`returned: true, input: false`). Set in `sendChangeEmailConfirmation`, cleared on effective change — drives the front "pending change" badge.
- [x] **Container + env** — `IPasswordBreachService` binding in `container.ts`; `HIBP_TIMEOUT_MS` in `env.ts`.
- [x] **Tests** — `hibp-password-breach.service.test.ts` (k-anonymity, found/not-found, network-error fail-open, non-ok response) + `password-policy.test.ts` (`findPasswordViolation` + `validatePassword`: length-guard skips HIBP, contextual ban, breach hit, fail-open).

### Front-end

- [x] **`ProfileCard`** — replaces the dead Card with two disabled inputs in `features/account/account.page.tsx`. Edits `name` + `email` (confirmation to current address; a `<Badge>` "Pending change to X" renders while `user.pendingEmail` is set) + avatar upload via the existing `createUploadMutationOptions` (presign → PUT → confirm), with a client-side type (`image/*`) + size (5 MB) guard and **filename sanitization** (accents stripped / invalid chars → `-`, to satisfy the server `^[\w\-. ]+$` contract) before upload. See [`docs/STORAGE.md`](STORAGE.md) for the key layout.
- [x] **`ChangePasswordCard`** — standalone card below `ProfileCard`, inline with existing Passkeys/2FA/Sessions/DataExport cards.
- [x] **`strongPasswordSchema`** (`shared/auth/auth.schema.ts`) — updated to `min(15)`, **all complexity regexes removed** (NIST `SHALL NOT` impose complexity). Applied to sign-up + reset flows as well.
- [x] **Password field UX (NIST-aligned)** — `FormTextField` (`@packages/ui`) gained a **show/hide reveal toggle** (NIST 800-63B-4 §3.1.1.2 recommends letting users reveal the password) + an optional `description` slot. Every new-password input (sign-up, reset, change) carries the hint *"At least 15 characters. Avoid passwords exposed in known data breaches."* Server-side policy rejections (HIBP breach, contextual ban, wrong current password) surface **inline on the offending field** via `form.setError` — routed to `currentPassword` vs `newPassword` by the message — instead of a transient toast.

### Decisions

1. **15 chars everywhere, no MFA exception** — the 8-with-MFA floor is a NIST *permission*, not an obligation. Implementing the two-tier would add session-state coupling to the password validator with zero security benefit at this scale. Simpler to hold 15 universally.
2. **HIBP fail-open** — breach-check failure (network, timeout) is captured via `IInstrumentation.capture()` but never blocks auth. Rationale: a transient HIBP outage must not prevent users from signing up or resetting. The risk of accepting one pwned password during a 3-second HIBP blip is lower than locking out all sign-ups.
3. **Validation via `hooks.before`, not `password.hash` override** — `password.hash` intercepts only hashing; `hooks.before` intercepts at the route level before any BetterAuth processing. This cleanly separates validation (policy) from hashing (crypto), and avoids reproducing BetterAuth's internal scrypt call.
4. **`user.changeEmail` confirmation to the current address** — confirms the current owner is aware of the change before the new address takes effect. BetterAuth auto-handles the verification challenge to the new address. The `change_email` template is new.
5. **No `/settings/profile` page** — rectification fields live in `/settings/account` (the existing page). A dedicated `/settings/profile` tab is reserved for Phase A.5 (Privacy dashboard). Splitting now would fragment UX without a composing container.
6. **Password policy extracted to a pure `validatePassword()`** — the security-critical logic (length guard + contextual ban + HIBP) can't be unit-tested inside a BetterAuth hook (hooks aren't testable in isolation), so it lives in `password-policy.ts` and the hook is a one-line caller. The inline common-password list was removed as redundant with HIBP. Schema change shipped as migration `0004` via `db:generate && db:migrate` (never `db:push` for a committed change — push bypasses `__drizzle_migrations` and desyncs the migrate trail).

### Change-email flow (2-step, BetterAuth)

`user.changeEmail` runs a **two-confirmation** flow — neither the request nor the first click mutates `user.email`:

1. **Request** — `authClient.changeEmail({ newEmail, callbackURL })` → `POST /change-email` (fresh-session gated). Our `sendChangeEmailConfirmation` hook sets `pendingEmail = newEmail`, emits `user.email.change_requested`, and mails the **current** address a confirmation link.
2. **Confirm (current address)** — the link hits `GET /api/auth/verify-email?token=…` (a `change-email-confirmation` JWT). BetterAuth mints a second token and mails the **new** address a verification link. Email still unchanged; redirects to `callbackURL`.
3. **Verify (new address)** — the second link (`change-email-verification` JWT) is what flips `user.email` to the new value (`emailVerified: true`). This fires `databaseHooks.user.update.after`, where we clear `pendingEmail` and emit `user.profile.updated { changes: { email } }`. The front "pending change" badge clears on the next session refetch.

**Mail links point at the API** (`baseURL/verify-email`), not the app front — for this one auth mail the click *is* the state transition (BetterAuth applies it server-side), then redirects to `callbackURL` (we pass `/settings/account`). The other auth mails (reset, magic-link, verify) route through the app because the front consumes their token. Storage/key conventions for the avatar upload are documented in [`docs/STORAGE.md`](STORAGE.md).

---

### Prod-validation closeout (Jun 2026) — live on `main`, release 1.19.2

The config-as-code shipped (above) but no one had run it end-to-end. Bringing the reference deploy actually green on Railway surfaced a **stack of prod-boot traps**, each masking the next (a failed deploy only reveals the next layer). All fixed (PR #50/#51 → `main`); api + app verified live.

- [x] **`NODE_ENV` override trap.** A Railway service var `NODE_ENV=development` *overrode* the Dockerfile `ENV NODE_ENV=production` (service vars beat Dockerfile `ENV` at runtime). In dev mode the logger loads `pino-pretty` — a devDependency absent from the `--prod` install → instant boot crash (`unable to determine transport target for "pino-pretty"`). Fix: set `NODE_ENV=production` explicitly, or leave it unset (the Dockerfile wins). Never `development` in prod.
- [x] **`WEBHOOK_MASTER_KEY` unset** → `env.ts` prod guard threw at boot. Generated + set.
- [x] **`@packages/access-control` declared `better-auth` as `peer`/`devDependency`, not a `dependency`.** A workspace package that imports a lib in its *runtime* source must declare it under `dependencies`, else `pnpm install --prod` skips it and the import is unresolved in the pruned image (`Cannot find module 'better-auth/plugins/access'`). Compiles in dev (hoisting + devDeps present), breaks only in the pruned prod image. Moved to `dependencies`.
- [x] **Email + storage threw at boot.** `di.preload()` is eager, so `ResendEmailService` and `S3StorageService` are constructed at startup and fail-hard'd when unconfigured. Changed to **warn-and-degrade**: email logs-not-delivers, storage swaps to a `NoOpStorageService` (returns `STORAGE_PROVIDER_FAILURE`; `/readyz` reports `storage:s3` as a non-critical warn). The API now boots without Resend/R2; those features stay inert until configured. **Reverses the Phase 1 email "boot-time fail-hard in production" decision** — right for a configured SaaS, wrong for a clonable boilerplate that must boot before the cloner wires Resend.
- [x] **`app` service Start Command override.** A leftover Railway Start Command `pnpm --filter app start` *replaced* the Dockerfile Caddy `CMD` in the `caddy:2.11-alpine` runner (no Node/pnpm) → the container exits instantly with **zero logs**, the healthcheck never passes, the deploy fails silently and reads as a phantom. Cleared the override so the Dockerfile `caddy run` CMD applies.
- [x] **Cross-site cookies.** `app` and `api` sit on different `*.up.railway.app` hosts = different sites (`up.railway.app` is a public suffix). BetterAuth session cookie set to `sameSite: isProd ? "none" : "lax"` so it survives the cross-site credentialed `fetch`. Custom domain under one shared parent (`api.x.com` + `app.x.com`) → `lax` works and is preferable; documented in `DEPLOY-RAILWAY.md` §8.
- [x] **Docs hardened for cloners** — `docs/DEPLOY-RAILWAY.md` gained §0 (boot traps + fail-hard-vs-degrade matrix), §8 (cookie strategy by domain topology), §9 (probe info-disclosure note), §12 (troubleshooting matrix with every trap above).

**Lessons (locked in):**
1. **`railway up` deploys local working-tree code; a variable change / *Redeploy* / git push rebuilds from the connected branch.** During the fix loop `railway up` was the only way to test uncommitted code; a mid-fix variable change rebuilt from `main` (no fixes yet) and re-crashed — confirming the model. Once merged, GitHub-integrated deploys took over and went green.
2. **`RAILWAY_GIT_COMMIT_SHA` only populates on branch deploys**, not `railway up`. `GIT_SHA`/`BUILD_TIME` show `unknown` under `railway up`; set them to the Railway reference vars (`${{RAILWAY_GIT_COMMIT_SHA}}`) so build-info tracks the deployed commit.
3. **A multi-service deploy fails one layer at a time.** Each ~3-minute build only reveals the *next* boot trap. Pre-scan for the whole class (eager-preloaded constructors that throw, peer-deps imported at runtime, dashboard overrides) instead of one-fix-per-deploy.

---

## Privacy / Terms versioning ✅ Phase A.2 · Jun 2026

**Why**: Art. 7 §1 RGPD — "the controller shall be able to demonstrate that the data subject has consented". Demonstrability requires recording *which version* was accepted and *when*. The boilerplate had zero versioning — a cloner shipping a policy update had no way to re-prompt users or produce compliance evidence. This phase closes that gap and lays the foundation for A.4 (consent stamps the policy version) and A.5 (privacy dashboard shows acceptance history).

### Shared package `@packages/policies` — version SSOT

- [x] **Source-only package** mirroring `@packages/access-control` (no build, `exports` points at `src/`). Exports `POLICY_TYPES` (`["privacy","terms"]`), `PolicyType`, `POLICY_VERSIONS` (`Record<PolicyType,string>`, both `"2026-01-15"`), `POLICY_CHANGELOG`, `PolicyChangelogEntry`. Imported by `apps/api` (gate + service), `apps/app` (sign-up form + page render), and `@packages/drizzle` (schema enum). **Single place to bump a version** — every consumer sees the change at compile time.

### DB — `policy_acceptance` table

- [x] Append-only table `policy_acceptance` (`packages/drizzle/src/schema/policies.ts`): `id, userId (FK user ON DELETE CASCADE), policyType, policyVersion, ipAddress (nullable), acceptedAt` + composite index `(userId, policyType, acceptedAt DESC)`. Migration `0005_sudden_leo.sql`.
- [x] **Two-layer compliance trail**: this table is the live gate evidence (fast lookup of latest accepted version per type); the durable 7-year compliance trail lives in `audit_log` via the `user.policy.accepted` event (`compliance` retention).

### Backend module `apps/api/src/modules/policies/` — compliance infra, not DDD

- [x] **Not DDD** — no aggregate, no domain events on a Value Object. Mirrors the `audit-log` module shape: a thin service over a port-backed store. A.4 (Cookie consent) is the **same class** — its expiry/withdrawal/scope rules reduce to date comparisons + `includes()` + the same `version ===`, so it ships as infra too. The boilerplate ships **zero aggregates**; `@packages/ddd-kit/Aggregate` is a published-lib surface that waits for the cloner's real product domain.
- [x] `IPolicyAcceptanceStore` port (module-private) + `DrizzlePolicyAcceptanceStore` — fully instrumented per rule §8 (outer span wrapping the method, inner span on `query.execute()`, `catch + instrumentation.capture`).
- [x] `PolicyAcceptanceService` — `accept(userId, types, ipAddress?)` writes N rows + emits N events atomically in one `uow.run` TX. `getStatus(userId)` returns `Record<PolicyType, { current, acceptedVersion }>`. `getStaleTypes(userId)` returns only the types where the latest accepted version differs from the current. `hasAcceptedCurrent(userId)` is the gate predicate.
- [x] Routes: `POST /me/policies/accept` (body `{ types?: PolicyType[] }` — omit to accept all stale), `GET /me/policies`. Both require auth. Mounted in `index.ts` `routes` chain.
- [x] `requireCurrentPolicies` middleware (`apps/api/src/shared/middleware/policy.middleware.ts`) — throws `HTTPException(409)` when any policy is stale. **Composable, not mounted globally by default** — there are no business routes yet; this is defense-in-depth for future routes. The live UX gate (the `_shell` `beforeLoad` redirect) is the primary enforcement today.

### Event `user.policy.accepted` — event catalogue grows from 34 to 35

- [x] Self-actor payload `{ userId, policyType, policyVersion, ipAddress? }`, retention `compliance`. `userId` resolves as the actor via `AuditEventSubscriber.extractActor` (self-actor: the subject accepted for themselves). Emitted from `PolicyAcceptanceService.accept` — fired from **two sites**: (1) the BetterAuth `/verify-email` after-hook in `auth.ts` (sign-up path), and (2) the `POST /me/policies/accept` route (explicit re-acceptance).

### As-built deviation: acceptance recorded at `/verify-email`, not `/sign-up/email`

The original plan proposed recording acceptance at the `/sign-up/email` route. This was changed during implementation for two reasons:

1. **No session at sign-up.** With `requireEmailVerification: true`, `/sign-up/email` has no session yet — reading a reliable `userId` from the response is unsafe because BetterAuth returns a *synthetic user* on duplicate-email attempts (anti-enumeration). The `userId` in the response is not guaranteed to be the just-created user.
2. **`/verify-email` is the natural idempotent boundary.** This route fires exactly when the user proves ownership of their email address. The session `userId` is reliable. Using `getStaleTypes(userId)` makes the call naturally idempotent — a user who re-verifies after an email change is a no-op because they already accepted the current version.

**Safety net**: the front `_shell` `beforeLoad` gate redirects any authenticated user with stale policies to `/legal/accept` regardless of which auth path they used (social login, magic link, or future SSO). This ensures the re-acceptance gate catches any edge case that bypasses the `auth.ts` hook.

### Frontend `apps/app/src/features/legal/`

- [x] **Sign-up form** — `signUpSchema` gained a required `acceptedPolicies: z.literal(true)` checkbox; its links to the two public pages open in a new tab so a misclick doesn't wipe the entered form. Acceptance is non-optional at sign-up; the server records it at `/verify-email`.
- [x] **Public pages** `/legal/privacy-policy` + `/legal/terms` — placeholder legal content keyed by version string, shared `PolicyDocView` component, `policies.config.tsx` registry + `getChangesSince` helper for the diff view.
- [x] **Acceptance gate** `/legal/accept` — under `_protected`, **outside `_shell`** to avoid a redirect loop. **Adapts to context**: a brand-new user with no prior acceptance (the magic-link / social sign-up path, where no checkbox was ever shown) sees a "Before you get started" welcome + a link to read each full policy; a returning user whose accepted version is stale sees an "Updated policies" header + the per-version changelog diff (`getChangesSince`). One Accept button either way; on success navigates to the originally intended route. This is what makes the magic-link sign-up path both legally explicit (affirmative accept, version+IP+timestamp recorded) and UX-clean (no confusing "what changed" on a first acceptance).
- [x] **`_shell` `beforeLoad`** — calls `policiesQueryOptions` (fresh) and redirects to `/legal/accept?redirect=<current>` when any type is stale. This is the primary UX enforcement layer.
- [x] `shared/api/queries/policies.ts` (`policiesQueryOptions`), `shared/api/mutations/accept-policies.ts`, `hooks/use-accept-policies.ts`.

### How a cloner uses it

Drop real legal text in `policies.config.tsx`. When a policy changes, bump the relevant string in `@packages/policies/src/versions.ts` and add a `POLICY_CHANGELOG` entry with a summary of changes. All authenticated users are re-prompted on next visit automatically — the `_shell` gate picks up the new version on the next query invalidation.

### Decisions

1. **`@packages/policies` as SSOT, not a front-only config.** The version string must be the same on the API (gate: is this version current?), the front (display + sign-up checkbox), and the DB schema (enum values). A front-only config means the API has a hardcoded constant elsewhere — drift. A shared package eliminates the sync requirement entirely.
2. **Append-only `policy_acceptance`, not an upsert.** Compliance requires the full history of when each version was accepted. An upsert destroys past evidence. The gate reads the latest row per `(userId, policyType)` via the DESC index — equivalent to an upsert for the gate predicate, with the full trail preserved.
3. **Not DDD.** The acceptance rule is `latestAcceptedVersion === currentVersion` — a comparison, not an invariant that requires aggregate lifecycle protection. Using an aggregate here would be the OpenUp anti-pattern (rule §test décisif: if the rule fits in a comparison, it's infra). **A.4 (Cookie consent) is the same call** — `isActive = withdrawnAt == null && expiresAt > now && policyVersion == current` is a WHERE clause, scope is `includes()`, validity/cooldown are date math; it ships as infra too. The boilerplate ships **zero aggregates** — `@packages/ddd-kit/Aggregate` earns its keep only once the cloner adds real product domain.
4. **`/verify-email` hook, not `/sign-up/email`** — see deviation note above. The key insight: the gate-predicate (front `_shell`) is the primary enforcement; the hook is best-effort plus defense-in-depth for the sign-up path specifically.
5. **`requireCurrentPolicies` composable, not global default.** Mounting it globally on all authenticated routes would make every current API call return 409 for a stale user — too aggressive. The UX re-acceptance gate is the live enforcement. The middleware is opt-in for future business routes that need hard server-side gating.

---

## Security perimeter — rate-limit + CSP + CSRF ✅ Phase C.1 · Jun 2026

**Why**: a boilerplate that ships auth, multi-tenant, and billing surfaces without a security perimeter is a liability for every cloner. Phase C.1 closes the four cheapest attack vectors: brute-force / credential-stuffing (rate-limit), XSS script injection (CSP), cross-site request forgery (CSRF), and CSP telemetry (report endpoint). All four were implemented as composable infra — no business logic inside, each addable or removable in `index.ts` without touching modules.

### S1 — Rate-limit core

- [x] **`requireRateLimit(deps, policy)`** factory (`apps/api/src/shared/middleware/rate-limit.middleware.ts`) — Hono middleware wrapping `IRateLimiter.consume`. On allowed: sets IETF `RateLimit-Policy` + `RateLimit` response headers (budget advertising). On blocked: sets `Retry-After` (floored to 1), throws `AppErrorException({ code: "SECURITY_RATE_LIMITED" })` → central error handler → 429. On first block: emits `security.rate_limit.exceeded` event if `policy.emitSecurityEvent` and outbox provided. On store error: either 503 `RATE_LIMITER_UNAVAILABLE` (fail-closed) or warn + pass-through (fail-open) — controlled per policy.
- [x] **`rate-limit.policies.ts`** — defines `PolicyConfig` interface + all named policies: `GLOBAL_POLICY` (60 req/min, 1800 req/hr, keyed user-or-IP, fail-open), 8 auth-burst policies (`AUTH_SIGN_IN`, `AUTH_FORGOT_PASSWORD`, `AUTH_MAGIC_LINK`, `AUTH_SIGN_UP`, `AUTH_TWO_FACTOR`, `AUTH_VERIFY_EMAIL`, `AUTH_RESET_PASSWORD`, `AUTH_PASSKEY` — all keyed by IP, `failClosed: true`, `emitSecurityEvent: true`, budgets hidden on sensitive paths), `CSP_REPORT_POLICY` (20/min + 200/hr, IP-keyed, fail-open, no budget headers).
- [x] **BetterAuth built-in `rateLimit` disabled** (`rateLimit: { enabled: false }` in `auth.ts`) — the Hono middleware is the single 429 path. One envelope, one store, one set of headers.
- [x] **Front 429 toast with countdown** (`apps/app/src/shared/api/errors/rate-limit-toast.ts`) — `showRateLimitToast({ message, seconds })` drives a sonner toast that ticks down every second and auto-dismisses at zero. Wired from `shared/api/errors/toast.ts`: if `apiErr.status === 429` and `metadata.retryAfter` is numeric, shows countdown; otherwise falls back to a plain error toast.

### S2 — Shared stores

- [x] **`IRateLimiter` port** (`apps/api/src/shared/ports/rate-limiter.port.ts`) — `consume(key, windows): Promise<Result<RateLimitDecision, RateLimitError>>`. `RateLimitDecision` carries `allowed`, `limit`, `remaining`, `resetSeconds`, `policyName`, `firstBlock`.
- [x] **`RateLimiterFlexibleAdapter`** (`apps/api/src/shared/services/rate-limiter-flexible.adapter.ts`) — implements `IRateLimiter` via `rate-limiter-flexible`. Constructor-injected `IInstrumentation` (§8 outer span on `consume`). Per-window limiters are lazily constructed and cached. A thrown `RateLimiterRes` = blocked decision; any other throw = `Result.fail(RATE_LIMITER_INTERNAL_ERROR)` after `instrumentation.capture(err)`.
- [x] **Durable Postgres store** — `RateLimiterDrizzle` backed by `rate_limit` table (migration `0007_medical_liz_osborn.sql`): `key TEXT PK`, `points INT`, `expire TIMESTAMPTZ`. `clearExpiredByTimeout` default (true) keeps the table lean via an unref'd 5-min purge — no sweep route needed for this ephemeral infra table.
- [x] **`RATE_LIMIT_STORE` env** — `z.enum(["memory", "postgres"]).default("memory")` in `env.ts`. `storeFactoryFor(store, clientFactory?)` returns `memoryFactory`, or calls `makeDrizzleFactory(clientFactory())` for postgres (throws if the factory is absent). Default is `memory` (zero-config dev); set to `postgres` before horizontal scaling.

### S3 — Strict CSP

- [x] **Per-request nonce via Caddy `templates`** (`apps/app/Caddyfile`) — the SPA is static-served by Caddy; Caddy's native `{http.request.uuid}` provides the per-request nonce with no app-server involvement. The `handle` block wraps `try_files` with `templates { mime text/html }` so Caddy processes the HTML template directives before serving.
- [x] **`Content-Security-Policy` header in Caddyfile**: `default-src 'self'; script-src 'nonce-{http.request.uuid}' 'strict-dynamic' https: 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https: wss:; frame-ancestors 'none'; object-src 'none'` + `report-uri` + `Reporting-Endpoints` pointing at `{$VITE_API_URL}/csp-report`.
- [x] **Vite `html.cspNonce`** (`apps/app/vite.config.ts:42`) — `{ cspNonce: "{{placeholder \`http.request.uuid\`}}" }`: Vite stamps `nonce=` attributes on `<script>` and `<style>` tags at build time using the placeholder string; Caddy's `templates` directive replaces the literal at request time with the actual UUID nonce.
- [x] **`POST /csp-report` endpoint** (`apps/api/src/shared/internal-routes/csp-report.route.ts`) — mounted before the global restrictive CORS so browsers can post unauthenticated cross-origin. Handles both `application/csp-report` (legacy) and `application/reports+json` (Reporting API v1). IP-rate-limited via `CSP_REPORT_POLICY`. Sets `Cross-Origin-Resource-Policy: cross-origin` to prevent Chrome ERR_BLOCKED_BY_RESPONSE on the report POST. Filters out reports whose `document-uri` / `documentURL` origin doesn't match `APP_URL` (third-party extension noise). Emits `security.csp.violation` event (`EventTypes.SECURITY_CSP_VIOLATION`) via outbox.

### S4 — CSRF

- [x] **`requireCsrf(deps)` middleware** (`apps/api/src/shared/middleware/csrf.middleware.ts`) — Origin-allowlist strategy: safe methods (`GET`, `HEAD`, `OPTIONS`) and Bearer-authenticated requests pass through unconditionally; for all other methods, the `Origin` header must be present, non-`null`, and in `deps.allowedOrigins`. Violation throws `AppErrorException({ code: "SECURITY_CSRF_FORBIDDEN" })` → 403. The rejection `reason` (`missing_origin` | `origin_mismatch`) is included in the emitted `security.csrf.rejected` event but intentionally absent from the client response (no security-decision leak).
- [x] **Mounted** on `/me`, `/me/*`, `/uploads`, `/uploads/*`, `/settings/*`, `/admin/*` in `index.ts`.
- [x] **`allowedOrigins` reuses `env.CORS_ORIGIN`** — the same list fed to `cors()` and BetterAuth `trustedOrigins`; single source of truth for "who is our front".

### S4.1 — Rate-limiter store resilience

- [x] **Dedicated pg pool for the rate-limit store** (`packages/drizzle/src/rate-limit-client.ts`) — `getRateLimitDbClient()` lazy singleton: `new Pool({ max: 3, connectionTimeoutMillis: 500, idleTimeoutMillis: 30_000 })` + `drizzle(pool, { schema: rlSchema })`. The package exports only `getRateLimitDbClient()` and the `RateLimitDbClient` type; the underlying `Pool` is never exposed. Mirrors the `getDb()` pattern in `config.ts`.
- [x] **`makeDrizzleFactory(client)` higher-order** — replaces the old `drizzleFactory` closure that captured the global `db`. Takes a `RateLimitDbClient` and returns a `RateLimiterFactory`. `storeFactoryFor(store, clientFactory?)` calls `makeDrizzleFactory(clientFactory())` for postgres (throws `"RateLimitDbClient factory is required for the postgres store"` if absent); for memory, `clientFactory` is never called — no pool allocated in memory mode.
- [x] **`container.ts` binding** — `getRateLimitDbClient` passed by reference (lazy): `storeFactoryFor(env.RATE_LIMIT_STORE, getRateLimitDbClient)`. The dedicated pool is created only if `RATE_LIMIT_STORE=postgres`, on first HTTP resolution.
- [x] **DoS amplification vector closed** — under flood the dedicated pool (max: 3) saturates; `pg` throws "timeout" in ≤ 500 ms → adapter `capture(err)` + `Result.fail` → fail-closed policies → 503 `RATE_LIMITER_UNAVAILABLE`. The global app pool (max: 20) is never touched.
- [x] **`insuranceLimiter` — skip (fail-closed-fast).** A real pg outage means app-wide outage; an in-memory fallback during pg-down would be moot. Decision to revisit only if a Redis store lands (Redis is not in the stack today).
- [ ] **Caddy `Reporting-Endpoints` backtick syntax** — confirmed valid Caddyfile raw-string syntax, not leaked to the browser. Pending: runtime `curl -I` verification in production.

### Hardening pass

Post multi-agent SOTA-2026 review, several low-cost hardening items were folded in before shipping:

- [x] **Fail-closed on auth policies** — `failClosed: true` on all 8 auth-burst policies. When `IRateLimiter.consume` returns `Result.fail`, the middleware throws `RATE_LIMITER_UNAVAILABLE` (503) instead of passing through. Rationale: a transient store outage must not silently disable brute-force protection (OWASP A10:2025 / CWE-636). `GLOBAL_POLICY` and `CSP_REPORT_POLICY` remain fail-open — a store outage should not block normal browsing or CSP telemetry.
- [x] **`CORS_ORIGIN` fail-hard in production** — `env.ts` throws at boot if `NODE_ENV === "production"` and `CORS_ORIGIN` is unset. Without it the API falls back to `localhost`, which rejects the real front and collapses both the `cors()` and `requireCsrf` allowlists silently.
- [x] **`TRUSTED_PROXIES` CIDR + `private` keyword** (`rate-limit.ip.ts`) — `resolveClientIp` uses `node:net` `BlockList` to check trust. The `private` keyword expands to all RFC1918 + loopback + CGNAT ranges (mirrors Caddy's `trusted_proxies private_ranges`), allowing Railway/PaaS deploys to set `TRUSTED_PROXIES=private` without pinning a non-stable internal IP. Plain IPs and CIDR notation also accepted. Boot warns in production if `TRUSTED_PROXIES` is unset (collective lockout risk behind a load-balancer).
- [x] **CSRF 403 leaks no reason** — the `reason` field used internally for the emitted audit event is not forwarded to the client response. Only `"CSRF check failed"` is visible externally.

### As-built deviation: CSRF is Origin-allowlist, not double-submit cookie

The ROADMAP originally specified a `__Host-csrf` cookie + `X-CSRF-Token` double-submit pattern. Dropped for two reasons:

1. **Cross-origin deploy makes double-submit physically impossible.** App and API are on different eTLD+1 origins (distinct `*.up.railway.app` hosts). `document.cookie` is per-origin; `__Host-` forbids `Domain=`; so the front can never read a cookie set by the API origin to echo it back as a header.
2. **Origin-header validation is the 2026 SOTA.** Next.js Server Actions, SvelteKit, and Remix all use it. The `Origin` header is unforgeable by the browser (forbidden header), stateless, and requires zero front-end code or dedicated CSRF endpoint.

Bearer-authed requests (Capacitor mobile) skip `requireCsrf` entirely: no ambient cookie means no CSRF surface, and a forged cross-origin request cannot set `Authorization` without a CORS preflight that the `cors()` allowlist blocks.

### As-built deviation: CSP nonce in Caddy, not a Hono middleware

The ROADMAP assumed a `csp.middleware.ts` injecting the nonce server-side. That model requires the app server to intercept and modify HTML responses — impossible when the SPA is a pre-built static bundle served directly by Caddy. Caddy's `templates` directive with `{http.request.uuid}` is the correct per-request nonce mechanism for static SPAs: no app-server roundtrip, zero Bun involvement, cryptographically unique per request (UUID v4 from Caddy's internal counter).

`/csp-report` is public (browsers post unauthenticated — HMAC verification is impossible from a browser context); it is defended instead by rate-limit + `Cross-Origin-Resource-Policy: cross-origin` + document-uri origin filter.

### As-built deviation: Trusted Types deferred

Trusted Types was in scope as a CSP directive but was deferred to its own story. In `report-only` mode on a non-migrated React app, every React DOM call produces a violation and floods `audit_log` with noise. Browser baseline is also partial: Firefox support is not stable, and Safari only reached partial support in 26.1 (2026). The nonce-based CSP ships first; Trusted Types lands once React's DOM abstraction is Trusted-Types-compatible in the project's baseline.

### Decisions

1. **Single unified Hono rate-limit middleware; BetterAuth built-in disabled.** One 429 error envelope (`SECURITY_RATE_LIMITED`), one §8-instrumented store, one set of IETF headers. BetterAuth's built-in has its own 429 shape and its own in-memory store — running both creates two codepaths for the same property. Disabling it is the right call once you own the layer.
2. **Fail-closed on auth, fail-open on global traffic.** A store outage must not silently disable brute-force protection (OWASP A10:2025). Noted v-next: a circuit-breaker / degraded in-memory fallback would avoid a transient store glitch turning prolonged login into 503 for all users.
3. **`env.CORS_ORIGIN` as single source of truth for "who is our front".** The same list feeds `cors()`, `requireCsrf({ allowedOrigins })`, and BetterAuth `trustedOrigins`. One place to update when the front domain changes; misalignment between cors and csrf would be an open CSRF hole.
4. **`TRUSTED_PROXIES=private` is the correct Railway value.** The container is only reachable via the platform's edge proxy over the private network, so trusting private ranges is safe and avoids pinning a non-stable internal IP. Mirrors the Caddyfile's `trusted_proxies static private_ranges`. Single-IP pinning is fragile — Railway recycles IPs across deploys.
5. **Cookie `sameSite: none` in prod is required; `requireCsrf` is the replacement CSRF layer.** The cross-origin (different eTLD+1) Railway-domain deploy means cookies must be `none` to survive credentialed `fetch`. `SameSite` no longer provides transport-layer CSRF protection in that topology; `requireCsrf` (Origin allowlist) is the explicit in-app replacement. Cloners who deploy under a single parent domain (`api.x.com` + `app.x.com`, same eTLD+1) should switch to `sameSite: "lax"` for a free transport-layer CSRF layer on top.

### Deployment debt

- `RATE_LIMIT_STORE=memory` is per-replica — all in-process state is lost on restart and not shared across instances. Switch to `postgres` before horizontal scaling; a second replica with `memory` store effectively halves the rate-limit budget.
- `TRUSTED_PROXIES` must be set (`private` on Railway) before going to production. If unset, all requests appear to originate from the load-balancer IP — rate-limit keys collide and a small burst from one user can trigger a collective lockout. Boot warns but does not hard-fail (dev default of unset is fine).
- **Pool isolation — shipped S4.1.** The Postgres rate-limit store runs on a dedicated pool (max: 3, connectionTimeoutMillis: 500 ms), separate from the app `db` pool (max: 20). Pool exhaustion under a traffic spike or DDoS flood can no longer spill over into application query capacity.

### S5a — Abuse-prevention quick-wins (Jul 2026)

Three OSS signals wired into the BetterAuth `hooks.before`, each emitting a `security.*` event so the audit rail sees every rejection. **BetterAuth's Sentinel plugin (`@better-auth/infra`) covers all of this** — credential-stuffing, HIBP, impossible-travel, geo/bot blocking, free-trial abuse — **but it is a paid, API-key-bound cloud SaaS**, which fails the zero-mandatory-SaaS rule. We mined its threat model and shipped the cheap, calibration-free subset ourselves; the SOTA-2026 review confirmed no self-hostable OSS equivalent exists.

- **HIBP breached-password telemetry.** `validatePassword` already rejected Pwned-Passwords hits (NIST policy, A.1); S5a makes the reject *observable* — it now returns `{ message, isBreach }` so the hook emits `security.password.breached` only on a genuine breach (not on a length/format violation), on sign-up / reset / change-password.
- **Per-account credential-stuffing counter.** A second `IRateLimiter.consume("auth-sign-in:account:<email>", …)` axis on `/sign-in` (5/15min default, **fail-closed** → 503 on store error, 429 on block), on top of the existing per-IP middleware. IP-only is dead against distributed botnets rotating source IPs against one account; the account axis catches exactly that. Reuses `security.rate_limit.exceeded` with `policyName: "auth-sign-in-account"` (no new event type) — segmentable in dashboards by `policyName`.
- **Disposable-email block.** `IDisposableEmailService` (embedded `disposable-email-domains` ~90k-domain `Set`, O(1)) + a DNS MX lookup (`node:dns/promises` `resolveMx`, native on Bun; no MX ⇒ treated as disposable). **Fail-open**: a DNS error/timeout warns and lets the sign-up through — an outage must never block legitimate users. Emits `security.signup.rejected`.

**As-built gotcha (cost the demo, not the unit tests): `ctx.context.*` is undefined in a BetterAuth `hooks.before`.** The global before-hook runs before the session middleware, so `ctx.context.request` and `ctx.context.session` are both `undefined` there (they *are* populated in `hooks.after`). The initial implementation read the client IP via `ctx.context.request.headers` → a `TypeError` that (a) escaped uncaught on `/sign-in` → **500 on every login**, and (b) was swallowed by the emit's own `try/catch` on the other paths → **the three events never persisted** despite the 422/429 firing. Unit tests don't mount the BetterAuth hooks, so only an end-to-end pass (curl + `outbox_event` query) surfaced it. Fix: read the IP from `ctx.headers`, and load the change-password actor via `auth.api.getSession({ headers: ctx.headers })` so `security.password.breached` carries the real `actorUserId` on an authenticated change (rule §7). **Lesson: any story wiring a library's lifecycle hooks must be exercised end-to-end — a green unit suite proves nothing about the hook boundary.**

### Still pending

Captcha hook (Turnstile / hCaptcha via `ICaptchaService` port — S6), and the calibration-heavy **S5b** abuse signals deferred until real traffic exists to tune them: impossible-travel detection (geo-IP + haversine, false-positive risk on VPN / carrier-NAT), free-trial abuse (accounts-per-visitor / device fingerprint — the disposable-email block already ships as the cheap first layer), geo / suspicious-IP deny-list.

### How a cloner uses it

1. Set `TRUSTED_PROXIES=private` (Railway) or the relevant CIDR for your platform proxy.
2. Set `CORS_ORIGIN` to the front's public URL (required in production — hard boot error if absent).
3. Set `RATE_LIMIT_STORE=postgres` before horizontal scaling; leave `memory` for single-replica deploys.
4. The 8 auth-burst policies and GLOBAL policy are pre-wired in `index.ts`. Add a `requireRateLimit(deps, policy)` call for any new public endpoint that needs its own budget.
5. `requireCsrf` is already mounted on the mutation-capable prefixes. New mutation prefixes → add a `app.use("/new-prefix/*", csrf)` line.
6. CSP report URL is baked into `Caddyfile` via `{$VITE_API_URL}`. Violations appear in `audit_log` with `event_type = 'security.csp.violation'`.

---

## Compliance docs bundle ✅ Phase A.3 · Jul 2026

**Why**: two legal obligations were shipping as missing pages — GDPR Art. 28 (sub-processor disclosure is mandatory when acting as a data processor for any EU client) and EAA Art. 14 (accessibility statement mandatory since June 28 2025). Bundled with two contractual templates (DPA + DORA annex) because they share the same context window and are all pure Markdown / static config: no DB, no backend, no event. A missing sub-processor page or accessibility statement is a legal violation the moment a clone ships to EU users; a missing DPA template blocks every EU enterprise deal.

### Front pages (`apps/app/src/features/legal/`)

- [x] **`sub-processors.config.ts`** — typed const `SUB_PROCESSORS` (interface `SubProcessor { name, purpose, region, category, url?, dpaUrl?, status }`). Active entries: Resend (transactional email, US DPF-certified), Cloudflare R2 (object storage, EU option available), BetterAuth OAuth (identity provider bridge, N/A region). Planned entries: Stripe (billing), GrowthBook (feature flags), Umami (analytics).
- [x] **`sub-processors.{route,page}.tsx`** — public route `/legal/sub-processors`, no auth gate (child of `rootRoute`). 4 Cards: "What is a sub-processor?" (context), Active sub-processors (shadcn `<Table>` columns: Name / Purpose / Region / DPA), Planned sub-processors (same Table), Change notice (Art. 28 §2 30-day advance-notice language + `dpo@[domain]` contact). `last-updated: 2026-07-09`.
- [x] **`accessibility.{route,page}.tsx`** — public route `/legal/accessibility`, no auth gate. 5 `<section>` blocks with `<TypographyH2>` headings: Compliance status (WCAG 2.1 AA / EN 301 549 v3.2.1 target), Known limitations, Technical specifications, Feedback and contact (`accessibility@[domain]` alias), Enforcement and escalation. Page itself exemplary a11y: single `<h1>`, genuine `<h2>` section headings, `mailto:` link labelled with the alias address.
- [x] **Router + palette wiring** — `apps/app/src/router.tsx` adds 2 public child routes under `rootRoute`. `command-palette.tsx` adds both routes to `LEGAL_ROUTES` group (visible on ⌘K). `data-rights.page.tsx` gains cross-link `<Card>` components to both new pages.

### Contract templates (`docs/legal/`)

- [x] **`DPA-template.md`** — 12-clause GDPR Art. 28 Data Processing Agreement. Covers: subject matter + duration, nature/purpose/type of personal data, categories of data subjects, processor obligations, sub-processor management (30-day notice per Art. 28 §2), data location + jurisdiction, technical and organizational measures, audit rights, incident notification (72h), data return/deletion on contract end, liability. Placeholders: `[CLIENT_NAME]`, `[EFFECTIVE_DATE]`, `[CLIENT_CONTACT]`, `[DPA_CONTACT]`.
- [x] **`DORA-annex-template.md`** — 11-provision DORA Art. 30 annex for EU fintech/insurance clients (mandatory since Jan 17 2025). Provisions: description of services, SLA targets (RPO/RTO mirroring Phase 0.3 disaster-recovery), data location + jurisdiction, audit rights (on-site + remote + documentary), sub-contractor chain disclosure, incident reporting (mirrors NIS2 24h first notice / 72h impact assessment / 1-month final report), operational continuity + exit plan + reversibility, security standards certification, change management notification, data portability on exit, insurance. Sourced from the 11 mandatory Art. 30 contractual provisions per DORA regulatory text (EU 2022/2554).
- [x] **`README.md`** — index of both templates + usage decision table (fintech or DORA-regulated EU client → DPA + DORA annex; non-fintech EU B2B → DPA only; non-EU → neither, though DPA is best practice) + consolidated placeholder checklist to complete before production: `accessibility@[domain]`, `dpo@[domain]`, national accessibility authority name per EAA Art. 14, client-specific fields per template.

### Clone-ability fix (`apps/app/src/shared/env.ts`)

- [x] **`VITE_SENTRY_DSN`** — schema was `z.url().optional()`. The `.env.example` ships the var as an empty string (`VITE_SENTRY_DSN=`). Zod `optional()` coerces `undefined` → skip, but `""` is not `undefined` — `z.url().parse("")` throws a validation error at boot. Fix: `z.preprocess((v) => (v === "" ? undefined : v), z.url().optional())`. The boilerplate now boots clean on a fresh `pnpm bootstrap` without requiring the cloner to manually delete the empty DSN line.

### As-built deviations

1. **No footer links → command-palette + `data-rights` cross-links.** The roadmap spec said "linked from footer (every page)". No global footer component exists in the app shell (top-nav only — SOTA 2026 pattern, see App shell entry). Links surface instead via two discoverability points: the command-palette (`LEGAL_ROUTES` group, visible on ⌘K search) and `data-rights.page.tsx` (explicit cross-link cards). Footer links can be added when a global footer is introduced (likely Phase E.2 marketing site).
2. **`CardTitle` heading tree → `<TypographyH2>`.** A review finding: shadcn `<CardTitle>` renders as `<div>`, not an `<h2>` — the `<h1>` page title had no `<h2>` children, a WCAG 1.3.1 heading-structure violation. Fixed by replacing `<CardTitle>` with `<TypographyH2>` for section cards, so the heading tree is valid and the accessibility statement is itself accessible.
3. **Component props `interface` over `type`.** A review finding: component prop types were declared with `type` instead of `interface`. Fixed to `interface SubProcessorCardProps { ... }` per the project rule (component props = `interface`; `type` reserved for unions/mapped types).

### Decisions

1. **0 domain events.** Pages are 100% static reads — no aggregate, no write path, no compliance state change. Event count stays at 40. A `compliance.sub_processors.viewed` style instrumentation event would be analytics, blocked until A.4 consent ships.
2. **`status: "active" | "planned"` split.** Rather than a flat list, sub-processors are split into active (contractually engaged today, require DPA coverage) and planned (will require a DPA update before they go live — Art. 28 §2 30-day advance notice obligation). This makes the contractual obligation visible: a cloner who activates Stripe must move it from planned to active and trigger the notice.
3. **`url?` + `dpaUrl?` both optional.** Not every sub-processor publishes a DPA URL directly; some (BetterAuth OAuth) are conditional-on-use. Optional fields allow the config to be honest about availability without breaking the type or rendering empty cells.
4. **Accessibility statement written before A.6 CI gate.** The statement declares a WCAG 2.1 AA conformance target but acknowledges known limitations and defers the auto-update to A.6 Lighthouse CI. This is the EAA-compliant posture: the statement must exist (obligation since Jun 2025); its accuracy improves as A.6 lands. A statement with a complaint contact satisfies the obligation; a blank page does not.

---

## Cookie consent + Consent management ✅ Phase A.4 · Jul 2026

**Why**: la directive ePrivacy + RGPD Art. 7 exigent un consentement valide avant tout dépôt de cookie non-nécessaire. Sans banner conforme, un clone qui ajoute Umami, Plausible, Stripe pixel ou n'importe quel tracker est illégal en EU dès le premier déploiement. Le boilerplate n'avait aucune surface de consentement — A.4 ferme ce gap, fournit la mécanique de réconciliation guest→user, et expose les primitifs (`<ConsentGate>`, `<AnalyticsScripts>`) pour que les cloners branchent leurs outils sans réécrire la couche.

**Pourquoi infra, pas DDD** : toutes les règles de consentement passent le test décisif — `isActive = withdrawnAt IS NULL AND expiresAt > now AND policyVersion = current` est une WHERE clause ; la catégorie = `categories.includes(cat)` ; la validité = comparaison de dates. Même classe qu'A.2 (`modules/policies/`). Le boilerplate livre **zéro aggregate** — `@packages/ddd-kit/Aggregate` attend le domaine produit du cloner.

### Package `@packages/cookie-consent` — version SSOT

- [x] **Source-only** (miroir `@packages/policies`, aucun build). Exports : `CONSENT_CATEGORIES = ["necessary","functional","analytics","marketing"] as const`, `OPTIONAL_CATEGORIES`, type `ConsentCategory`, `COOKIE_CONSENT_VERSION = "2026-07-09"`, `CONSENT_GRANT_TTL_DAYS = 180`, `CONSENT_REFUSAL_TTL_DAYS = 180`, `CONSENT_COOKIE_NAME = "cc_sid"`. Importé par api, app, et `@packages/drizzle`. Bump `COOKIE_CONSENT_VERSION` → re-prompt automatique de tous les users.

### DB — `consent_record` table

- [x] **Append-only** `consent_record` (`packages/drizzle/src/schema/consent.ts`) : `id, subjectId NOT NULL, userId nullable FK user ON DELETE CASCADE, categories jsonb, policyVersion, grantedAt, withdrawnAt nullable, expiresAt, ipAddress, userAgent`. Chaque call `record()` = nouveau row — le plus récent gagne. Conformité trail intact même après retrait (les rows de grant précédents restent). Migration `0009_elite_jack_power.sql`.
- [x] **2 indexes** : `(subjectId, expiresAt DESC)` pour les lookups guest (avant login) et `(userId, expiresAt DESC)` pour les lookups post-réconciliation.
- [x] **`subjectId` device-scoped** — UUID généré serveur, stocké dans le cookie `cc_sid` httpOnly. Découple le consentement du compte (un guest peut consentir avant de créer un compte). La réconciliation au login lie le subjectId à l'userId.

### Backend module `apps/api/src/modules/consents/` — compliance infra, pas DDD

- [x] **`IConsentStore`** port (module-private) : `insert`, `findActiveBySubject`, `findActiveByUser`, `linkSubjectToUser`. `DrizzleConsentStore` entièrement §8-instrumenté (outer span method, inner span query.execute, catch+capture).
- [x] **`ConsentService`** : `record(subjectId, userId?, categories, policyVersion, ip?, ua?)` (append-only, chaque save = nouveau row) · `withdraw(subjectId, userId?, categories?)` · `getActive(subjectId, userId?)` avec **fallback** subjectId quand un user connecté n'a pas encore de record (ex. login après guest-consent) · `reconcile(subjectId, userId)` (UPDATE `user_id` WHERE `subject_id = cookie AND user_id IS NULL`).
- [x] **Routes publiques `/consents`** (`optionalAuth` — fonctionne pour guests ET utilisateurs connectés) : `POST /` (record, génère le cookie `cc_sid` serveur via `resolveClientIp`), `GET /` (état courant), `DELETE /` (withdraw). Cookie `cc_sid` : `httpOnly: true`, `secure: isProd`, `sameSite: isProd ? "none" : "lax"`, `path: "/"`. **Pas de prefix `__Host-`** — le déploiement cross-origin (SPA + API sur des origines distinctes Railway) rend `__Host-` inutilisable (`Domain` refusé + secure required, mais `sameSite: none` pour cross-origin).
- [x] **CSRF Origin sur `/consents`** — monté dans `index.ts` comme tous les prefixes de mutation.
- [x] **Rate-limit `CONSENT_POST_POLICY` sur POST/DELETE uniquement** — un GET rate-limité saturait la fenêtre et bloquait l'affichage du banner (bug découvert en test : après plusieurs reloads, le GET `/consents` retournait 429 et la bannière flashait en boucle). GET est exempt.
- [x] **Sweep guests expirés** (`apps/api/src/shared/internal-routes/sweep-consents.route.ts`, gate `internalLayers` HMAC) : purge `user_id IS NULL AND expires_at < now() - INTERVAL X days` (env `CONSENT_RETENTION_DAYS=365`, guests orphelins uniquement). Ajouté au runner `cron/sweep.ts` — appelé après les autres sweeps pour respecter les FK.
- [x] **Wiring** : `container.ts` `.addModule(consentModule)`, `index.ts` route `/consents` + sweep + rate-limit conditionnel POST/DELETE + CSRF.

### Réconciliation au login — `hooks.after` + `ctx.context.newSession`

Décision clé de l'architecture : la réconciliation guest→user se fait **entièrement côté serveur**, sans round-trip client, via le hook BetterAuth `hooks.after`.

- [x] Dans `auth.ts`, `hooks.after` (`createAuthMiddleware`) : si `ctx.context.newSession` est non-null (= un login vient d'avoir lieu — signal couvre **TOUS** les flux : password/passkey/magic-link/2FA/email-verify/OAuth futur sans changement de code), lit `cc_sid` depuis les headers (`readCookieFromHeaders(ctx.headers, CONSENT_COOKIE_NAME)`), appelle `di.ConsentService.reconcile(subjectId, userId)` → `UPDATE consent_record SET user_id = ? WHERE subject_id = ? AND user_id IS NULL`.

**Pourquoi `hooks.after` + `ctx.context.newSession` et PAS `databaseHooks.session.create`** :
1. `databaseHooks.session.create.after` n'a **pas** accès aux cookies de la requête HTTP — confirmé par la source BetterAuth (le hook reçoit le model `session` et la `ctx.session`, pas les `Request` headers). Lire le cookie `cc_sid` y est impossible.
2. `hooks.after` + `createAuthMiddleware` donne accès aux `ctx.headers` (la requête HTTP complète). `ctx.context.newSession` est le signal canonique "un login vient d'avoir lieu sur cette requête, tous flux confondus" — BetterAuth le positionne exactement pour ce pattern.
3. Un seul point d'entrée = pas de drift si BetterAuth ajoute un nouveau flux d'authentification (OAuth, SSO SAML) : `newSession` sera positionné pour ces flux aussi.

**Règle générale extraite** : pour exécuter du code à chaque login (tous flux confondus) avec accès aux cookies de requête, utiliser `hooks.after` + `createAuthMiddleware` + vérifier `ctx.context.newSession`. `databaseHooks.session.create` est TX-bound mais n'a pas les headers.

### Frontend `apps/app/src/shared/`

- [x] **`api/queries/consent.ts`** — `consentQueryOptions` (état serveur initial pour éviter le flash-of-banner à l'hydratation).
- [x] **`api/mutations/record-consent.ts`** + **`withdraw-consent.ts`** — factories `mutationOptions`.
- [x] **`hooks/use-consent.ts`** — `useConsent(category: ConsentCategory): boolean`. Hook impératif : lecture de l'état consenti pour un usage conditionnel dans du code impératif.
- [x] **`components/cookie-banner.tsx`** (`<CookieBanner>`) — symétrie CNIL Reject/Accept (même prominence, même niveau, même taille — exigence renforcée après sanctions CNIL 2025 : Google 325M€, Shein 150M€), `necessary` non-toggleable (always on), auto-monté dans `app-providers.tsx`, caché si consentement courant, expansion inline pour `<ConsentSettings>`.
- [x] **`components/consent-settings.tsx`** (`<ConsentSettings>`) — toggles reflètent l'**état réellement consenti** (pas de pré-réglage GPC qui écraserait le choix user).
- [x] **`components/consent-gate.tsx`** (`<ConsentGate category>`) — **primitif d'application déclaratif** : rend ses enfants seulement si la catégorie est consentie (au-dessus de `useConsent`). Pattern recommandé pour gater du JSX.
- [x] **`components/analytics-scripts.tsx`** (`<AnalyticsScripts>`) — **exemple d'usage** : charge le script `VITE_ANALYTICS_SRC` (env optionnel, ex. Umami/Plausible) seulement si `analytics` consenti via `<ConsentGate>`, cleanup React au retrait. Monté dans `app-providers.tsx`. Le boilerplate ne trace rien par défaut (env vide) — le cloner met son URL d'analytics dans `VITE_ANALYTICS_SRC`.
- [x] **`components/legal-footer.tsx`** (`<LegalFooter>`) — footer avec liens vers toutes les pages légales, monté dans `AppShell` (users connectés). Source `shared/legal-routes.ts` (`LEGAL_ROUTES`) extrait de `command-palette.tsx` (DRY — les deux consomment la même const).
- [x] **Page `/legal/cookies`** (`features/legal/cookies.{route,page}.tsx` + `cookies.config.ts`) — inventaire cookies par catégorie (CNIL obligation de transparence), route publique sous `rootRoute`.
- [x] **`shared/env.ts`** : `VITE_ANALYTICS_SRC: z.string().url().optional()` ajouté.
- [x] **Toast 429 global consolidé** (`observability/query-error-handler.ts`) — `notifyIfRateLimited` centralise le toast 429 (message + durée formatée depuis `Retry-After`) pour **toutes** les queries ET mutations, dédup par `id`. `toastError` cède le 429 au global. L'ancien `rate-limit-toast.ts` (countdown seconde-par-seconde) est **supprimé** — inadapté aux durées `CONSENT_REFUSAL_TTL_DAYS` (heures/jours, pas secondes). Cette consolidation est un sous-livrable A.4 (le consent POST est la première route avec une durée de several hours).

### Events `user.cookie_consent.{granted,withdrawn}` — compteur 40 → 42

- [x] Déclarés dans `packages/events/src/event-types.ts` : `USER_COOKIE_CONSENT_GRANTED = "user.cookie_consent.granted"` + `USER_COOKIE_CONSENT_WITHDRAWN = "user.cookie_consent.withdrawn"`.
- [x] Payloads Zod : `{ subjectId: string, userId: z.string().optional(), categories: z.array(ConsentCategorySchema), policyVersion: z.string(), ipAddress: z.string().optional(), userAgent: z.string().optional() }`. `userId` optionnel (guests). `actorUserId` non déclaré séparément (userId = acteur self-actor quand connecté ; guest sans userId = acteur implicite via subjectId, `AuditEventSubscriber` positionne `actorType = "system"` — exception documentée, le seul identificateur disponible est `subjectId`).
- [x] Retention `compliance` dans `RETENTION_MAP` — trace durable 7 ans.
- [x] Émis depuis `ConsentService.record` et `ConsentService.withdraw` via `emitEvent(outbox, ...)` dans `uow.run` TX.

### Décisions SOTA (recherche 2026 vérifiée)

1. **Device-scoped vs user-scoped** — l'architecture originale (ROADMAP) prévoyait `userId NOT NULL` sur `consent_record`. Changé en `subjectId NOT NULL, userId nullable` pour deux raisons : (a) un guest doit pouvoir consentir avant de créer un compte (checkout-flow, marketing site futur) — sans subjectId, le consentement est perdu au login ; (b) RGPD Art.7§1 requiert "démontrer que la personne a consenti" — la preuve est le record horodaté, pas la session. La réconciliation au login lie le guest au compte sans perdre l'historique.
2. **Réconciliation via `hooks.after`+`newSession`, pas `databaseHooks`** — voir section dédiée ci-dessus. La contrainte technique (pas d'accès aux cookies dans `databaseHooks`) a forcé ce choix ; la solution est plus solide (couvre tous les flux en un point).
3. **Rate-limit GET exclu** — le GET `/consents` est appelé à chaque rendu initial (consentQueryOptions en prefetch). Un rate-limit sur GET saturait la fenêtre en quelques reloads normaux et bloquait l'affichage du banner (bug reproduit en test manuel). POST et DELETE sont les seules opérations write → seules à limiter.
4. **Append-only, pas d'idempotence sur record** — chaque `POST /consents` crée un nouveau row même si les catégories n'ont pas changé (ex. user clique "Accept all" deux fois). Rationale : la trace complète des changements de consentement est une exigence de compliance (l'auditeur veut voir "l'user avait accepté marketing le 3 juillet, puis l'a retiré le 5") ; une upsert détruirait cet historique. Le "plus récent gagne" est géré par les indexes `expiresAt DESC`.
5. **GPC requalifié hors scope EU** — après SOTA review 2026 : le Groupe de Travail 29 n'a jamais adopté une position contraignante sur GPC ; l'EDPB ne l'a pas reconnu comme signal de retrait valide au sens RGPD ; seule la CCPA (California) lui donne force légale. Le modèle opt-in du boilerplate (rien tracké sans consentement explicite) satisfait intrinsèquement la conformité RGPD, ce qui rend le header-checking redondant en EU.
6. **DNT mort** — le W3C a officiellement abandonné la spécification DNT en 2024. Tous les navigateurs majeurs ont retiré l'option de leurs UI. Ignorer `DNT: 1` est la posture correcte en 2026.
7. **Google Consent Mode v2 hors scope** — aucun produit Google dans le stack (analytics self-hosted via Umami/Plausible). IAB TCF v2.2 pareillement (heavy, vendor-specific, B2B SaaS ne fait pas de programmatic advertising).
8. **`<AnalyticsScripts>` comme exemple, pas comme primitif figé** — le composant montre le pattern (gater via `<ConsentGate>`, cleanup au unmount) ; le cloner le remplace ou le réutilise. Aucune dépendance runtime sur un outil spécifique — `VITE_ANALYTICS_SRC` vide = composant no-op.
9. **Toast 429 consolidé** — le sous-livrable "toast 429 global" était initialement dans le scope A.4 parce que `CONSENT_REFUSAL_TTL_DAYS=180` produirait des `Retry-After` de plusieurs heures, que l'ancien countdown seconde-par-seconde (`rate-limit-toast.ts`) ne gérait pas. La consolidation via `notifyIfRateLimited` bénéficie à TOUTES les routes rate-limitées (pas seulement `/consents`), donc c'est une amélioration globale déclenchée par A.4.

### As-built deviations

1. **Routes `/consents` (public) vs `/me/consents` (auth required)** — le spec original prévoyait `POST /me/consents` (requireAuth). Changé en `/consents` + `optionalAuth` pour que les guests puissent enregistrer leur consentement sans compte. Découle directement de la décision device-scoped.
2. **`@packages/cookie-consent` vs `config.ts` inline** — le spec original mettait la config dans `modules/consents/config.ts`. Promu en package séparé (source-only, miroir `@packages/policies`) pour que le front puisse importer `CONSENT_CATEGORIES` et `COOKIE_CONSENT_VERSION` sans circular deps. Même raisonnement que `@packages/policies`.
3. **Composants dans `shared/components/` vs `@packages/ui`** — le spec prévoyait de mettre `<CookieBanner>` dans `@packages/ui` pour réutilisabilité (app + futur marketing site). Laissé dans `shared/components/` pour l'instant : le marketing site (Phase E.2) n'existe pas encore, et promouvoir vers `@packages/ui` sans consommateur concret est le OpenUp anti-pattern. Promouvoir sur 2ème consommateur (règle 14).
4. **`<LegalFooter>` extrait depuis command-palette** — le ROADMAP prévoyait un footer avec liens légaux. Implémenté via `<LegalFooter>` monté dans `AppShell`, avec `LEGAL_ROUTES` extrait de `command-palette.tsx` (DRY — la palette et le footer sourcent la même liste). Le footer légal est visible pour tous les users connectés (AppShell), et les pages légales sont accessibles via ⌘K pour les non-connectés.
5. **`onEvent` umami-disable déféré** — la tâche "un `onEvent(...)` handler fires client-side umami.disable()" n'a pas été implémentée. La raison : `<AnalyticsScripts>` unmount via React quand `useConsent("analytics")` devient `false` — ce qui couvre le cas Umami/Plausible (le script se supprime du DOM). Un `onEvent` backend dédié serait de la plomberie pour le même résultat dans un contexte où l'analytics est self-hosted sans SDK JS "disable". Déféré jusqu'au premier consommateur avec un SDK qui expose explicitement `.disable()`.
5. **`docs/legal/README.md` as the cloner's decision guide.** The fintech-vs-B2B table and placeholder checklist are the highest-value item in A.3 for cloners: they prevent "which template do I send?" ambiguity at first EU enterprise signature and surface the production-readiness gaps (`accessibility@`, `dpo@`, national authority) that are easy to overlook.

---

## Billing — Stripe subscriptions + feature/seat gating ✅ Phase B.1 · Jul 2026

**Why**: every SaaS needs billing. B.1 ships the plumbing as permanent infra — not a disposable demo — following the same infra-not-DDD principle as policies (A.2) and consent (A.4). The alternative (leaving billing to the cloner) means every clone rebuilds the same Stripe webhook idempotency, subscription SSOT decision, seat-gating hooks, and free-tier fallback independently — that is the OpenUp anti-pattern at scale.

**Posture**: zero billing backoffice. Stripe Checkout handles upgrades; Stripe Billing Portal handles subscription management. The app surfaces only the current plan, seat usage, an Upgrade button (→ Checkout), and a Manage button (→ Portal). A public `/pricing` page lists live plans fetched from the Stripe catalog. Copy and prices live in Stripe; no redeploy is needed to change them.

### Wire-up

- [x] **`@better-auth/stripe@1.6.23`** (`stripe@22.3.0`) — Stripe customer = per organization (honoring the Phase 2 multi-tenant decision). Plugin provisions the `subscription` table, handles webhook ingestion at `POST /api/auth/stripe/webhook` (BetterAuth-owned, HMAC-signed by Stripe), and exposes `createCheckoutSession` / `createPortalSession`.
- [x] **Subscription state SSOT = `subscription` table** (plugin-managed, webhook-synced). `organization.metadata` carries no plan data. The table has typed Drizzle columns, a FK to `organization`, and requires no poll-to-Stripe in the request path.
- [x] **Hybrid catalog** — price + display copy live in Stripe Products (`marketing_features` = pricing bullets on the public page). Feature entitlements, tier rank, and `maxMembers` live in typed code at `apps/api/src/modules/billing/config.ts` (`ENTITLEMENTS` map). `metadata.tier` on the Stripe Product is the sole join key. Editing a gate or seat cap = a reviewable code change, never a silent dashboard edit.
- [x] **Unlimited seats = `null`** (JSON-safe). `Infinity` is not JSON-serializable (`JSON.stringify(Infinity) === "null"` — a silent wrong value). A magic sentinel like `9999` silently becomes a real limit. `null` is explicit and makes the nil-check obvious: `if (maxMembers !== null && current >= maxMembers)`.
- [x] **Standard free-tier model** — unlimited team orgs per account; each free org is capped at 3 members with no premium features; paid orgs inherit higher caps from `ENTITLEMENTS`. No per-account org-count cap (would require a cross-org aggregate on every org-create path — avoidable complexity; re-evaluate only when a product decision explicitly gates on org count).
- [x] **Seat gates in all three org hooks** — `beforeAddMember` + `beforeAcceptInvitation` + `beforeCreateInvitation` all check `ENTITLEMENTS[tier].maxMembers`. All three are required: gating only `beforeAddMember` leaves a window where an admin can issue more invitations than the seat cap allows; the acceptances then fail with an unhelpful error (see review catch §3 below).
- [x] **Three gate axes (transferable pattern)** — any cloner adding a premium feature picks from these:
  1. **Role gate** — `billing:["read","manage"]` in `@packages/access-control` (pre-existing from Phase 2). `billing:read` = owner + admin; `billing:manage` = owner only. Applied via `requireOrgPermission({ billing: ["manage"] })` on `POST /billing/portal`.
  2. **Seat quota** — `ENTITLEMENTS[tier].maxMembers` in the org hooks above. Returns `403 BILLING_SEAT_LIMIT_REACHED` (a capability boundary, not a payment request).
  3. **Tier/feature gate** — `requireFeature(flag)` / `requirePlan(minTier)` (back, returning `402 BILLING_PAYMENT_REQUIRED`); `useEntitlements()` / `<FeatureGate flag>` / `<PlanGate minTier>` (front). `402` = "available on a higher plan" — semantically distinct from `403` (wrong permission) or `401` (unauthenticated).
- [x] **Module `apps/api/src/modules/billing/`** — infra no-DDD, mirrors `modules/consents/`:
  - `CatalogService` — assembles `Plan[]` by fetching active Stripe Products + Prices and merging with `ENTITLEMENTS`. Degrades to free-only when `STRIPE_SECRET_KEY` is unset (boilerplate ships without keys by design).
  - `EntitlementsService` — `resolveEntitlements(tier)` returns the typed `ENTITLEMENTS` entry; `getSubscriptionTier(orgId)` reads the `subscription` table.
  - `SubscriptionReadStore` — §8-instrumented (outer span per method, inner span on `query.execute()`, `catch + instrumentation.capture`).
  - `StripeCatalogSourceAdapter` — all Stripe SDK calls isolated here, instrumented with `op: "http.client"`. `CatalogService` never touches the SDK directly.
  - Routes: `GET /billing/plans` (public, no auth), `GET /billing/subscription` (requireAuth), `POST /billing/checkout` (requireAuth), `POST /billing/portal` (requireAuth + `billing:manage`).
- [x] **Frontend** (`apps/app/src/features/billing/`): public `/pricing` (plan list + bullets from `marketing_features`); `/settings/billing` (current plan, seat usage, Upgrade / Manage buttons); `useEntitlements()` hook; `<FeatureGate flag>` + `<PlanGate minTier>` declarative render gates.
- [x] **4 new events** emitted from `@better-auth/stripe` callbacks in `auth.ts` via `emitEvent(outbox, ...)`:
  - `billing.subscription.created` / `billing.subscription.updated` / `billing.subscription.cancelled` / `billing.payment.failed` — all `compliance` retention (billing/financial audit trail; the whole `billing.*` family shares one retention lifetime, no divergence).
  - Catalog total: **46 events**.
- [x] **Env** — `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`. No `STRIPE_PRICE_*` env vars: prices live in Stripe. `STRIPE_SECRET_KEY` unset → free-only degradation, no boot failure.
- [x] **`RgpdService.executeAccountWipe`** — closes the "Stripe customer cleanup during wipe" deferred from Phase 1. Customer deletion is called in the wipe sequence; failure is captured and logged (non-fatal — account deletion must never be blocked by a Stripe API error).

### Decisions (B.1)

1. **State SSOT = plugin `subscription` table, not `organization.metadata`**. Metadata is an opaque blob: not queryable by column, not typed at compile time, and subject to divergence when a webhook arrives out of order. The plugin table has a FK to `organization`, a typed schema, and no in-request poll to the Stripe API. This was the central design decision — the alternative was the most common Stripe integration mistake.

2. **Hybrid catalog (Stripe + typed code, `metadata.tier` as join key)**. Pure-Stripe (all entitlements in Product metadata) means a feature gate change is a dashboard edit — unreviewed, unversioned, silently live. Pure-code (hardcode prices) means a price change requires a deploy. The hybrid: prices and copy in Stripe (the natural editor, change without a deploy), capabilities in code (must pass code review, version-controlled). `metadata.tier` is the only stable contract; the rest of the Product object is unconstrained.

3. **`null` for unlimited, not `Infinity`**. `JSON.stringify(Infinity) === "null"` — a silent wrong value. `null` is idiomatic for "no limit" in JSON and makes the check (`maxMembers !== null`) unambiguous. The sentinel `9999` was also ruled out: it silently becomes a real cap if a customer ever reaches it.

4. **Standard unlimited-orgs model**. An alternative was capping org count per account per plan (e.g., "3 orgs on free, unlimited on paid"). Rejected: (a) the Phase 2 multi-tenant architecture has no per-account org-count tracking — adding it requires a new cross-org aggregate query on every org-create path; (b) the dominant SaaS precedent (Vercel, Linear, Resend) limits seats and features within an org, not org count. Re-evaluate only if an explicit product decision makes org count a differentiator.

5. **`402 BILLING_PAYMENT_REQUIRED` code suffix required in the response body**. A bare `HTTPException(402)` produces no `code` field in the error envelope — the client-side branch is unreliable. The suffix makes "upgrade required" distinct from hypothetical future `402 STRIPE_PAYMENT_FAILED` (direct purchase) at the protocol level (see review catch §2 below).

6. **Whole `billing.*` family = `compliance` retention (no divergence)**. Subscription state changes and payment failures are all part of the billing/financial audit trail (potentially subject to RGPD Art. 30 processing records / financial record-keeping) — `compliance` retention. `operational` was initially considered for `billing.payment.failed` (a transient dunning signal), but keeping the whole family on one retention lifetime avoids a split audit trail where a failed-payment record is purged before the subscription events that reference it.

7. **Loose-typed `authClient.billing.*` (documented debt)**. `@better-auth/stripe` v1.6.23 client extensions are not fully typed — `useActiveSubscription()` and `createCheckoutSession()` return `any` in client types. The app confines them behind typed adapters in `features/billing/_api/`; the untyped surface is a single file. The adapter layer absorbs the upstream fix in one place when it lands.

### Review catches (pre-merge whole-branch pass)

Four issues caught before merge — all fixed:

1. **Portal route missing `billing:manage` gate** — `POST /billing/portal` initially had `requireAuth` only. Any authenticated member could redirect to the org's Stripe portal and change the payment method or cancel the subscription. Fixed: added `requireOrgPermission({ billing: ["manage"] })`.

2. **`402` response body missing code suffix** — a bare `throw new HTTPException(402)` in an early draft produced no `code` field in the error envelope. The error handler's `instanceof HTTPException` branch could not distinguish it from other 402s. Enforced the `BILLING_PAYMENT_REQUIRED` code in the body at all call sites.

3. **`beforeCreateInvitation` not seat-gated (rule §6 gap)** — only `beforeAddMember` and `beforeAcceptInvitation` were gated initially. An admin could create 10 invitations for a 3-seat free org; the first 3 acceptances succeed, the remaining 7 fail at acceptance time with a generic error and no clear recovery path. Added `beforeCreateInvitation` to the seat-check hooks.

4. **Double `billing.subscription.cancelled` emission** — an early draft emitted `cancelled` from both the `subscription.updated` webhook (when `cancelAtPeriodEnd` flips to `true` — a *scheduled* cancellation) and `subscription.deleted` (actual termination). These are distinct business facts. Fix: `subscription.updated` emits `billing.subscription.updated` (with `cancelAtPeriodEnd` in the payload for observers that care); only `subscription.deleted` emits `billing.subscription.cancelled`. The final catalog has 4 unambiguous events.

---

## Quota gating ✅ Phase B.2

**Why**: the third gate axis in the billing design (Role, Seats, Tier/Feature from B.1) was always quotas — quantitative limits per org per billing period (projects, uploads, API calls). Shipped as a **dormant, complete skeleton** extending B.1: no code path calls `requireQuota` or `reserveQuota` today, but the plumbing is wired and the primitives are knip-whitelisted so they survive dead-code checks until the first product feature needs them.

**Two-layer design (anti-TOCTOU)**:

- **Pre-check (`requireQuota` middleware)** — UX-layer, runs before the write, returns `429 BILLING_QUOTA_EXCEEDED` early so the client never does work it can't commit. Optional; mounted per route. Uses `countScopedRows` (a `COUNT(*)` over the source table) or the `quota_usage` denormalized counter.
- **Authoritative reserve (`reserveQuota`)** — inside `uow.run()`, acquires a Postgres advisory lock (`pg_advisory_xact_lock(orgId hash, quotaKey hash)`) then recomputes the count and compares against the limit *within the same TX as the insert*. No TOCTOU: the count and the write are atomic. Fails with `BILLING_QUOTA_EXCEEDED` if the ceiling is hit. Lock is advisory-only: a concurrent writer without the lock can still insert (enforcement is opt-in per resource, matching the dormant-skeleton philosophy).

**Two counting strategies**:

- **Live `COUNT(*)` (default)** — `countScopedRows(tx, table, orgIdCol, orgId)`. The source table is the truth; zero drift. For uploads/projects/seats (low-to-medium volume).
- **Denormalized `quota_usage` (high-volume)** — `IQuotaUsageStore.increment(orgId, resource, period, tx)` writes a counter row in the same TX as the business write, window-aligned on `currentPeriodFor(subscription)` (the Stripe billing period). Use when a `COUNT(*)` over millions of rows would be prohibitive. Bounded drift via period reset; a nightly reconciliation (`used = COUNT(*)`) is the belt-and-suspenders recommendation.

**Atomic reserve decision** — advisory locks (`pg_advisory_xact_lock`) were chosen over `SELECT … FOR UPDATE` on the usage row because: (a) the `quota_usage` row may not exist yet (first use in a period), requiring an upsert + lock sequence that advisory locks short-circuit; (b) advisory locks are XACT-scoped (auto-release at TX end, no explicit unlock); (c) they add zero table contention on the resource table itself. The downside (two non-serializable writers in the same ms window theoretically racing) is accepted: the quota check is fail-open in that narrow window, and the consequence is a transient over-limit write that the pre-check already filtered.

**SOTA rejections (2026)**:

1. **Stripe Entitlements API** — boolean-only (feature flags, not counts). No quantitative quota, no runtime blocking.
2. **Stripe Billing Meters** — async metering-to-bill (Stripe receives usage data and bills it), not synchronous gating-to-block. A metered event reaching Stripe does not prevent the next write; the cap enforcement lives on the Stripe invoice, not at the API call.
3. **`@better-auth/stripe` native `limits`** — the `@better-auth/stripe` plugin v1.x exposes a `limits` object on the subscription record. Using it would create a 2nd SSOT: entitlements in code (`ENTITLEMENTS[tier]`) for features and a separate limits map in the plugin config for quotas. Kept unified in `ENTITLEMENTS[tier].quotas` — gate change = code + deploy, not a dashboard edit or a plugin config drift.

**Why not DDD**: the decisive test — `count(rows) >= limit` is a WHERE clause and a comparison. No aggregate invariant, no `ValueObject`, no `DomainEvent` bubbling from a `Quota` entity. Every quota rule collapses to config lookup + arithmetic. Applying DDD here would match the OpenUp anti-pattern (ratio test/code > 3×). `modules/quotas/` is infra: a typed store + a `currentPeriodFor` helper.

**Dormant + knip**: the primitives are not called by any product code today. `knip.json` whitelists `apps/app/src/shared/auth/quota-gate.tsx` (front gate) and `apps/api/src/shared/db/quota-reservation.ts` (back atomic reserve) as explicit `entry` points — the boilerplate-primitive pattern, same as `feature-gate.tsx` and `plan-gate.tsx` from B.1. `modules/quotas/module.ts` is covered by the existing `src/modules/*/module.ts` glob.

---

## Operator audit log — cross-org read + tamper-evident hash chain + `/admin` zone ✅ Phase C.2 · Jul 2026

**Why**: the audit write-path shipped with the event-driven foundation (May 2026) but rows were invisible — no read surface, no integrity proof. C.2 ships the read side as an **operator** (platform-admin) surface, repurposed from the originally-specced per-org admin page: cross-org filtering, a tamper-evidence hash chain, and the first `/admin` front zone (foundation for C.3 admin & impersonation).

- [x] **`GET /admin/audit-log`** — cursor-paginated (limit 1–500, default 50), filters `actorId` / `organizationId` / `targetType` / `targetId` / `actionPrefix` / `occurredFrom` / `occurredTo`. CQRS read side, no use case: `modules/audit-log/application/services/audit-query.service.ts`.
- [x] **Gate repurposed org → platform** — `requirePlatformAdmin` (`shared/middleware/platform-admin.middleware.ts`): operator = `env.PLATFORM_ADMIN_IDS` allowlist OR `user.role === "admin"`, optional MFA via `PLATFORM_ADMIN_REQUIRE_MFA` (403 `PLATFORM_ADMIN_MFA_REQUIRED`). NOT `requireOrgPermission({ auditLog: ["read"] })` — the surface is cross-org by design; the `auditLog` statement stays in `@packages/access-control` for a future per-tenant view.
- [x] **Tamper-evidence hash chain** (env-gated `AUDIT_TAMPER_EVIDENCE`, default off) — `audit_log.{sequence,prev_hash,hash}`: SHA-256 over canonical row content + `prevHash`, chain writes serialized via `pg_advisory_xact_lock(hashtext('audit_log_chain'))` inside the subscriber TX (`shared/services/audit-hash.ts`). `GET /admin/audit-log/verify` recomputes the full chain → `{ verified, rowCount, brokenAtId, brokenAtSequence }`.
- [x] **Meta-audit** — reading the audit log is itself audited: `security.operator.audit_accessed` (retention `compliance`) emitted only on the first page (cursor absent), not per pagination step. Event #48 at ship time; the C.5 recount (**52 total**) includes it.
- [x] **Front `/admin` zone** — pathless `adminLayout` (`beforeLoad: ensurePlatformAdmin`, mirror of the server gate via `customSession`-injected `user.isPlatformAdmin`) + `features/admin-audit-log/`: infinite cursor query, filter bar, `MetadataSheet` (auto-detects `before`/`after` keys in payload → side-by-side diff, else raw JSON), `ChainBadge` polling the verify endpoint.
- [x] **Operator nav** — conditional "Operator" pill in `AppShell` + "Operator" command-palette group, both driven by the shared `isPlatformAdmin(session)` helper.

**Decisions (C.2)**

- **Operator surface, not tenant surface** — a per-org audit page would either leak platform-level rows (`organizationId = null`) or hide them; the operator view reads everything, and a future tenant view (feature-gated `audit_log` in `ENTITLEMENTS`) stays a separate deliverable.
- **Hash chain global, not per-org** — one chain, one advisory lock; per-org chains would multiply genesis edge cases without adding forensic value (verification is operator-scoped anyway).
- **Genesis-at-activation** — rows written before `AUDIT_TAMPER_EVIDENCE=true` keep `hash = null`; the chain starts at the first hashed row (prev = `GENESIS_HASH`), so enabling the flag never requires a backfill migration.

---

## Outbound webhooks — SOTA hardening (Plans 1–2) + front UI + public catalog (Plan 3) ✅ Phase C.5 · Jul 2026

**Why (hardening)**: the event-driven foundation shipped the webhook worker with HMAC signing and jitter retry, but left several attack surfaces open: (1) SSRF — org admins can register arbitrary URLs; without validation an insider could exfiltrate cloud-instance metadata or pivot into private networks; (2) secret rotation — hard-cutting a secret during rotation breaks all in-flight verifications; a grace window is necessary; (3) delivery forensics — debugging a failing endpoint was guesswork without a per-attempt request/response log; (4) resource pressure — dead endpoints accumulate retry backpressure in the delivery worker queue and slow delivery for everyone; auto-disable with a distinct UX badge is the correct response.

**Why (front UI)**: the CRUD API was live but operator access required raw HTTP calls. `/settings/webhooks` surfaces endpoint management, delivery inspection, secret rotation, and test-fire in a single page. The public `/developers/events` catalog solves a real integration onboarding friction: customers need to know what events fire, what their payloads look like, and how to verify signatures without reading the source code.

### Back-end (Plans 1–2)

- [x] **SSRF guard** (`apps/api/src/modules/webhooks/application/validators/webhook-url.validator.ts`) — Zod custom validator that DNS-resolves the URL and checks every resolved IP against: loopback (127.0.0.0/8, `::1`), RFC1918 (10/8, 172.16/12, 192.168/16), link-local (169.254/16, `fe80::/10`), ULA (fd00::/8), CGNAT (100.64/10), cloud-metadata hosts (169.254.169.254, 169.254.170.2, fd00:ec2::254, metadata.google.internal, 100.100.100.200). Runs at create/update AND at delivery time — re-resolving at delivery closes the DNS-rebinding window (register a public domain → TTL-0 rebind to 169.254.169.254 by delivery time). Rejections → `WEBHOOK_URL_FORBIDDEN` (403).

- [x] **Dual-secret rotation** (`POST /settings/webhooks/:id/rotate-secret`) — `WebhooksService.rotateSecret` generates a new secret, stores it alongside the old one, and sets `rotatedAt = now()`. During the grace period (`WEBHOOK_SECRET_GRACE_HOURS`, default 24), `WebhookDeliveryWorker` signs with **both** secrets and emits `t=<ts>,v1=<hex_old>,v1=<hex_new>` in a single `x-webhook-signature` header. Consumers accept if **any** `v1=` value verifies. After the grace period the old secret is nulled. New secret returned once in the `POST` response body and never re-exposed. Emits `webhook.endpoint.secret_rotated`.

- [x] **Per-attempt delivery timeline** — `webhook_delivery_attempt` table (UUID v7 PK, FK → `webhook_delivery` ON DELETE CASCADE): `attemptNumber int`, `requestHeaders jsonb`, `requestBody text`, `responseStatus int?`, `responseHeaders jsonb?`, `responseBody text?` (capped at `WEBHOOK_RESPONSE_CAPTURE_BYTES` env, default 4096 bytes — prevents large HTML error pages from filling the table), `durationMs int`, `error text?` (network-level errors), `attemptedAt timestamptz`. `WebhookDeliveryWorker` writes one row per HTTP attempt inside the same TX as the delivery status update. Exposed via `GET /settings/webhooks/:id/deliveries/:deliveryId` → `{ delivery, attempts: DeliveryAttempt[] }`.

- [x] **Auto-disable failing endpoints** — `WebhookDeliveryWorker` tracks `consecutiveFailures` on the `webhook_endpoint` row. When `consecutiveFailures >= WEBHOOK_AUTO_DISABLE_MIN_FAILURES` (default 2) AND the first failure was more than `WEBHOOK_AUTO_DISABLE_AFTER_DAYS` (default 5) days ago: `status` flips to `auto_disabled`, `consecutiveFailures` stays set (forensics), `webhook.endpoint.disabled` emitted (payload: `{ endpointId, organizationId, consecutiveFailures, lastFailedAt }`). Re-enable: `PATCH /settings/webhooks/:id` with `{ status: "enabled" }` resets `consecutiveFailures` and `rotatedAt`. Fanout skips `auto_disabled` endpoints (no backpressure while disabled).

- [x] **Wildcard subscriptions** — `webhook_endpoint.eventTypes` accepts: `"*"` (all subscribable events), `"<group>.*"` (e.g., `"billing.*"`, `"user.*"`, `"org.*"`), or exact event names. `WebhookFanoutSubscriber` expands wildcards at fan-out time against `SUBSCRIBABLE_EVENT_TYPES`. **Internal events** (`webhook.test`, `webhook.endpoint.*`, `webhook.delivery.*`) are never included in the expandable set — they use the delivery worker directly and skip the fanout path entirely (no infinite-fanout loop).

- [x] **Test event** (`POST /settings/webhooks/:id/test`) — creates a `webhook_delivery` row with `eventType: "webhook.test"` and a synthetic payload targeted at the specific endpoint, bypassing the fanout subscriber (direct insert). Also auto-inserted on endpoint creation (immediate reachability feedback without waiting for a real event). Delivery is processed by `WebhookDeliveryWorker` identically to any other delivery and recorded in `webhook_delivery_attempt`.

- [x] **4 new internal events** (all `operational` retention, all non-subscribable, never fanout — `INTERNAL_EVENT_TYPES` set guards `WebhookFanoutSubscriber`):
  - `webhook.test` — targeted test delivery to a specific endpoint.
  - `webhook.endpoint.secret_rotated` — secret rotation. Payload: `{ endpointId, organizationId, actorUserId }`.
  - `webhook.endpoint.disabled` — auto-disable fired. Payload: `{ endpointId, organizationId, consecutiveFailures, lastFailedAt }`.
  - `webhook.delivery.exhausted` — delivery dead-lettered after all retry attempts. Payload: `{ deliveryId, endpointId, organizationId, eventType, attempts: number }`.
  - **Catalog after C.5: 52 total events, 48 subscribable, 4 internal.**

### Front-end (Plan 3)

Gated `webhooks: ["read"]` (list, deliveries, detail) / `webhooks: ["write"]` (create, update, delete, rotate, test). `SETTINGS_TABS` entry with `requires: { webhooks: ["read"] }`.

- [x] **Route** `apps/app/src/features/webhooks/webhooks.route.tsx` — nested under `_org-scope`, `beforeLoad: ensureOrgPermission({ webhooks: ["read"] })`.

- [x] **Page** `apps/app/src/features/webhooks/webhooks.page.tsx`:
  - Endpoint list with status badges: enabled (green), paused (yellow, user-set), auto-disabled (destructive — distinct from user-paused, avoids confusion about who disabled it).
  - Create/edit endpoint in a side Sheet — name, URL field, `EventTypePicker` grouped by namespace.
  - One-shot secret reveal on create — secret shown once in a `Dialog` with copy-to-clipboard, "I've saved it" to close. Never shown again.
  - Rotate-secret button (write gate) — calls `POST /:id/rotate-secret`, new secret revealed the same one-shot way.
  - Send-test button (write gate) — calls `POST /:id/test`, sonner toast on success/failure.
  - Per-endpoint delivery list: cursor pagination (`?cursor=<id>`), status filter (pending / success / failed / dead_letter), columns: event type, status, duration, attempted-at, replay button.
  - Per-delivery timeline drawer (`DeliveryDrawer`) — attempt rows with status, HTTP status, duration; expandable request headers/body and response headers/body panels.

- [x] **Queries** (`apps/app/src/features/webhooks/_api/webhooks.queries.ts`):
  - `endpointsQueryOptions(orgId)` — list all endpoints.
  - `endpointDeliveriesQueryOptions(endpointId, filters)` — paginated delivery list (cursor + status).
  - `deliveryDetailQueryOptions(endpointId, deliveryId)` — single delivery with `attempts[]`.

- [x] **Mutations** (`apps/app/src/features/webhooks/_api/webhooks.mutations.ts`):
  - `createEndpointMutationOptions` / `updateEndpointMutationOptions` / `deleteEndpointMutationOptions` — invalidate `endpointsQueryOptions` on success.
  - `rotateSecretMutationOptions` — response carries `data.secret` (the new plaintext secret, shown once).
  - `sendTestMutationOptions` — `POST /:id/test`, fires a toast.

- [x] **`EventTypePicker`** (`_components/event-type-picker.tsx`) — consumes `SUBSCRIBABLE_EVENT_TYPES` + `groupedSubscribableEvents` from `@packages/events`. Checkbox per event + group-level wildcard toggle + select-all. Used in both create and edit forms.

- [x] **Public developer catalog** (`apps/app/src/features/developers/developers.{route,page}.tsx`, no auth, under `rootRoute`):
  - `EventTypesTable` component — all 48 subscribable events in a table: group, event type, retention label (`operational` / `compliance`), description, expandable JSON schema (rendered from `jsonSchemaForEvent(type)` which wraps Zod 4's `z.toJSONSchema({ unrepresentable: "any" })`).
  - Node.js signature-verification snippet (matches the server's `t=<ts>,v1=<hex>` format exactly — cross-checked against `hmac-signer.ts`).
  - Route is public; linked from the command palette under "Developers".
  - `jsonSchemaForEvent` defined in `packages/events/src/json-schema.ts`, exported from `@packages/events`. Safe fallback for events not in `PayloadByEventType`.
  - `descriptionFor(type)` — human-readable description per event type, defined in `packages/events/src/descriptions.ts`, consumed by both `EventTypesTable` (catalog) and `EventTypePicker` (form). Same SSOT: no description drift.

### Decisions (C.5)

1. **SSRF guard at both create and delivery time (anti-rebinding)**: validating only at create allows a DNS-rebinding attack — a URL that resolves to a safe IP at registration time can re-resolve to `169.254.169.254` by delivery time via a TTL-0 record swap. Re-checking at delivery closes the window at the cost of one extra DNS lookup per delivery attempt (acceptable: already doing an HTTP connect).

2. **Multiple `v1=` values for secret rotation (Stripe-compatible)**: the simplest consumer-compatible model. Receivers already split on `,` then `=`; iterating pairs and accepting on first match requires ~3 extra lines. The alternative (a `x-webhook-signature-old` header) adds a new header contract that receivers must learn; the Stripe-style multi-value approach is self-contained in the existing header.

3. **`webhook.test` and `webhook.endpoint.*` as internal events (non-subscribable, non-fanout)**: the test delivery must travel through the outbox + delivery worker for realistic integration testing, but must never fan out to *other* endpoints' subscriptions. Marking them internal in `INTERNAL_EVENT_TYPES` achieves this: `WebhookFanoutSubscriber` skips them, and they don't appear in `EventTypePicker` or `EventTypesTable`. The four internal events expand the catalog to 52 without changing the subscribable set (still 48).

4. **Zod 4 native `z.toJSONSchema` for the public catalog**: spec §5 left the schema-rendering strategy open ("`zod-to-json-schema` vs hand-rolled walker"). Zod 4 ships `z.toJSONSchema({ unrepresentable: "any" })` natively — no external dependency, no walker, no drift. `jsonSchemaForEvent` wraps it with a safe fallback (`{}`) for unregistered event types.

5. **Separate `EventTypePicker` and `EventTypesTable` components (shared SSOT, distinct rendering contracts)**: the SSOT is `SUBSCRIBABLE_EVENT_TYPES` + `descriptionFor` + `jsonSchemaForEvent` + `groupedSubscribableEvents` in `@packages/events`. The two components are separate because their contracts are incompatible (interactive checkboxes with state + RHF integration vs. a static reference table with expandable JSON). A polymorphic component would add complexity without reducing drift — both already depend on the shared SSOT, so description and schema changes propagate to both automatically.

6. **`webhook_delivery_attempt` response body capped at `WEBHOOK_RESPONSE_CAPTURE_BYTES` (default 4096)**: the capture exists for debugging, not for storage. A 500-error HTML page from a misconfigured endpoint can be megabytes; capturing it in full would bloat the table indefinitely. 4096 bytes is enough to see the error type and message for every real-world error format (JSON API errors, Rails/Django HTML error pages truncated to the `<h1>`, plain-text). Configurable for operators who need more context.

7. **Auto-disable threshold is time-based + count-based (not count-only)**: a count-only threshold (e.g., "10 consecutive failures") would auto-disable an endpoint within minutes of a brief server restart — too aggressive. The time-based component (`WEBHOOK_AUTO_DISABLE_AFTER_DAYS`) ensures the endpoint has been failing for days, not just a maintenance window. The combination distinguishes "transient outage" from "dead endpoint".

### As-built deviations (C.5)

1. **`jsonSchemaForEvent` in `@packages/events`, not a separate package**: the schema-rendering helper was considered for a standalone `@packages/webhook-schema` package. Placed in `@packages/events` instead (new file `json-schema.ts`) because the primary consumer (`EventTypesTable`) already depends on `@packages/events` for `SUBSCRIBABLE_EVENT_TYPES` — adding the schema helper there avoids a new dependency and keeps the event catalog a single import.

2. **No `EventTypesTable` in `@packages/ui`**: the component is app-specific (links to the catalog page, uses app-side routing, depends on `@packages/events`). No second consumer exists today. Rule 14: promote on second occurrence.

3. **Test delivery bypasses `WebhookFanoutSubscriber`**: a test event could be emitted through the normal outbox path and discovered by the fanout subscriber, but that would require the fanout subscriber to special-case endpoint targeting (normally it's org-wide). Direct delivery-row insertion is cleaner and avoids the fanout subscriber needing to know about the concept of a "test delivery".

**Event**: `billing.quota.exceeded` (operational) — payload `{ organizationId, resource, limit, attempted, tier, actorUserId }`. Emitted only from `requireQuota` (the pre-check middleware). `reserveQuota` does NOT emit it — callers using `reserveQuota` inside `uow.run()` without the middleware must emit the event themselves if they want the telemetry. Catalog total: **47 events**.
