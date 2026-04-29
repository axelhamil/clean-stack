# ROADMAP

Upcoming integrations, **all SOTA 2026**, **outside DDD** (pragmatic layer: `adapters/`, `routes/`, `_hooks/`). DDD stays reserved for the pure business domain (`domain/`, `application/use-cases/`).

---

## Auth — BetterAuth (end-to-end)

**Why**: own the token, multi-provider, typed plugins (Stripe, organizations, 2FA, passkeys, magic-link), DB-backed sessions, first lib that runs natively on Bun + Hono with no hacks.

- [ ] Install `better-auth` + Drizzle adapter (`better-auth/adapters/drizzle`)
- [ ] Auth schemas generated via `better-auth generate` → `packages/drizzle/src/schema/auth.ts`
- [ ] Hono handler: `app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))`
- [ ] React client: `createAuthClient` in `apps/app/src/adapters/auth-client.ts`
- [ ] Plugins: `organization` (multi-tenant from day one, see dedicated section), `twoFactor`, `passkey`, `magicLink`, `stripe` (see Stripe section)
- [ ] Server-side session via Hono middleware → injected into `c.var.user`
- [ ] Pages `/sign-in`, `/sign-up`, `/forgot-password`, `/verify-email` in `features/auth/`
- [ ] Route middleware `beforeLoad` (TanStack Router) → redirect when not authenticated
- [ ] Cookies: `httpOnly` + `sameSite=lax` + `secure` in production

---

## Multi-tenant — BetterAuth `organization` plugin

**Why from day one**: migrating single-user → multi-tenant after the fact is hell (backfill `organizationId` everywhere, orphaned owners, rewrite every query). The reverse is free: if it ends up being B2C, every user gets an invisible auto-created "personal org".

- [ ] `organization` plugin enabled in the `auth` config
- [ ] Drizzle schemas generated: `organization`, `member`, `invitation` (+ `team` if needed)
- [ ] Auto-create a personal org on signup (`databaseHooks.user.create.after`)
- [ ] Session enriched with `activeOrganizationId` → Hono middleware that pushes it into `c.var.orgId`
- [ ] **Every business table** has an `organizationId` FK from the very first migration (never added later)
- [ ] Drizzle helper `withOrg(qb, orgId)` to systematically scope queries
- [ ] Pages: `/org/new`, `/org/settings`, `/org/members`, `/org/invitations` in `features/organization/`
- [ ] Org switcher in the header (`authClient.organization.setActive(id)`)
- [ ] Email invitations (dedicated Resend template)
- [ ] Roles: `owner`, `admin`, `member` (custom roles later if needed)
- [ ] Stripe customer = **per organization**, not per user (the Stripe plugin supports it natively)

---

## Billing — Stripe via the BetterAuth plugin

**Why**: `@better-auth/stripe` (official, late 2025) wraps customer creation, subscriptions, customer portal, webhooks, DB sync. No more 600 lines of hand-written Stripe glue.

- [ ] Install `@better-auth/stripe` + the `stripe` SDK
- [ ] Plugin declared in the `auth` config: products, prices, trial, webhook secret
- [ ] Webhook endpoint auto-mounted by the plugin → `/api/auth/stripe/webhook`
- [ ] Customer Portal: button calling `authClient.subscription.billingPortal()`
- [ ] Checkout: `authClient.subscription.upgrade({ plan: "pro" })`
- [ ] `useSubscription()` hook in `apps/app/src/adapters/queries/` (cross-feature)
- [ ] UI gating via `subscription.status === "active"` (no custom feature flag)
- [ ] Stripe tests via `stripe listen` in dev (forward webhooks)

---

## Email — Resend (dashboard templates)

**Why**: templates managed from the Resend dashboard (no code, no rebuild to change wording), built-in versioning, native A/B test. Stays pragmatic: we just call the API by template ID.

- [ ] Install `resend`
- [ ] Service `apps/api/src/adapters/services/email.service.ts` → minimal wrapper `sendTemplate(templateId, to, data)`
- [ ] Templates created in the Resend dashboard, IDs in env (`RESEND_TPL_WELCOME`, `RESEND_TPL_RESET_PWD`, etc.)
- [ ] Resend webhook for bounces/complaints → `routes/webhooks/resend.ts`
- [ ] DNS domain (SPF/DKIM/DMARC) check in the README
- [ ] BetterAuth: wire `sendVerificationEmail` / `sendResetPassword` to the Resend service

---

## Storage — Cloudflare R2 (prod) + MinIO (dev)

**Why**: R2 = no egress fees, S3-compatible. MinIO local = same S3 API → one codebase, switched via env.

- [x] MinIO added to `docker-compose.yaml` (ports 9000 API, 9001 console, bucket `clean-stack` auto-created)
- [ ] Install `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
- [ ] Service `apps/api/src/adapters/services/storage.service.ts` (presigned upload + download URLs)
- [ ] Env: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
  - Dev: `http://localhost:9000` + `minioadmin` / `minioadmin` / bucket `clean-stack`
  - Prod: R2 endpoint + R2 access keys
- [ ] Route `POST /uploads/presign` → returns a signed URL (auth required via BetterAuth middleware)
- [ ] `useUpload()` hook on the app (PUT directly to the presigned URL, no proxy through the API)
- [ ] MinIO console: http://localhost:9001 (`minioadmin` / `minioadmin`)

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
