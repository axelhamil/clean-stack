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

- [x] SeaweedFS added to `docker-compose.yaml` under profile `storage` (random host port for `:8333`, bucket `clean-stack` auto-created by `seaweedfs-init` via `weed shell`) — dev only, opt-in.
- [x] Install `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` + `@hono/zod-validator`.
- [x] **Pure transport port** (`apps/api/src/application/ports/storage.port.ts`) — `IStorageService` exposes `presignUpload` / `presignDownload` / `headObject` / `deleteObject` / `publicUrlFor`. Zero business rules; the adapter just signs S3 requests and forwards SDK calls.
- [x] **S3 adapter** (`apps/api/src/adapters/services/storage.service.ts`) — `S3Client` with `region: "auto"` (R2's only accepted value), `forcePathStyle` (kept on for SeaweedFS/MinIO compat — harmless on R2). Boot-time fail-hard in production if `S3_ENDPOINT` is localhost or creds are the dev defaults (`dev`/`dev`). Presigned PUT signs `content-type` + `content-length` headers (`signableHeaders`) so the client can't drop them.
- [x] **Use-cases for orchestration only** — `create-upload-url`, `create-download-url`, `confirm-upload` (`apps/api/src/application/use-cases/`). Each gets `IStorageService` via constructor. **Owner-scoping enforced in use-cases**: every key is `<userId>/<scope>/<uuid>-<filename>`; download + confirm reject any key whose prefix is not `<requestingUserId>/` (`STORAGE_FORBIDDEN`). `confirm-upload` performs `HeadObject`, deletes on size/content-type mismatch, returns `STORAGE_INTEGRITY_FAILED`.
- [x] **Validation lives at the controller boundary** — Zod schemas in the route enforce filename regex (`^[\w\-. ]+$`), scope regex (`^[a-z][a-z0-9-]{0,31}$`), max size (`STORAGE_MAX_UPLOAD_BYTES`, default 50 MB), TTL defaults. Zod failures return 400 via the centralised error handler.
- [x] **Per-call granularity**: presign body accepts `scope` (default `"uploads"`) and `expiresInSeconds` (default 5 min for upload / 10 min for download), clamped server-side to `[STORAGE_PRESIGN_TTL_MIN_SECONDS, STORAGE_PRESIGN_TTL_MAX_SECONDS]` (default `[60, 3600]`).
- [x] **Env** (`apps/api/common/env.ts`): `S3_ENDPOINT` (R2 prod: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` or `…eu.r2.cloudflarestorage.com` for EU jurisdiction — once chosen, R2 cannot move the bucket), `S3_REGION` (R2: `auto`), `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`, `S3_PUBLIC_URL`, `STORAGE_MAX_UPLOAD_BYTES`, `STORAGE_PRESIGN_TTL_MIN/MAX_SECONDS`. Dev defaults to SeaweedFS (host port random — find it with `docker compose port seaweedfs 8333`; in-network it's `seaweedfs:8333`).
- [x] Routes (typed RPC, chained into the `routes` export): `POST /uploads/presign`, `POST /uploads/confirm`, `POST /uploads/download`. All `requireAuth`. Error mapping: 403 (`STORAGE_FORBIDDEN`), 404 (`STORAGE_NOT_FOUND`), 422 (`STORAGE_INTEGRITY_FAILED`), 502 (`STORAGE_PROVIDER_FAILURE`).
- [x] **Flat DI container** (`apps/api/src/di/container.ts`) — inwire infers everything; sections by line comments (`// infra`, `// uploads`). Use-cases registered next to the infra ports they depend on, type-checked by inference (reorder a `.add()` to put a use-case before its port → `tsc` rouge). `AppDeps = typeof di` derived after `.build()`. Promote a section to `modules/<context>.module.ts` only when a bounded context grows large enough to bloat `container.ts`.
- [x] `createUploadMutationOptions` (`apps/app/src/adapters/mutations/create-upload.ts`) — TanStack Query `mutationOptions` factory chaining `presign` → `PUT` direct to R2 (with explicit `Content-Length`) → `confirm`. Returns `{ key, publicUrl, size, contentType }` only after server-verified integrity. Consumed via `useMutation({ ...createUploadMutationOptions, onSuccess, onError })`. Accepts optional `scope` + `expiresInSeconds`.
- [x] **First Hono RPC consumer** — `apps/app/src/adapters/api-client.ts` uses `hcWithType` from `api/client` (subpath export, pre-typed `ApiClient`), with custom `fetch` interceptor (X-Request-Id, slot for 401/Capacitor) and trailing-slash normalization. Future features call the API exclusively through this typed client.

> Dev: opt-in via `docker compose --profile storage up -d`. SeaweedFS has no auth by default (any creds accepted). No web console; use `aws s3 --endpoint-url=$(docker compose port seaweedfs 8333)` or browse via the app.

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
