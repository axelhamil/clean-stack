# ROADMAP

Intégrations à venir, **toutes en SOTA 2026**, **hors DDD** (couche pragmatique : `adapters/`, `routes/`, `_hooks/`). DDD reste réservé au métier pur (`domain/`, `application/use-cases/`).

---

## Auth — BetterAuth (end-to-end)

**Pourquoi** : owner du token, multi-provider, plugins typés (Stripe, organizations, 2FA, passkeys, magic-link), sessions DB-backed, 1ère lib qui tourne nativement Bun + Hono sans hack.

- [ ] Install `better-auth` + adapter Drizzle (`better-auth/adapters/drizzle`)
- [ ] Schémas auth générés via `better-auth generate` → `packages/drizzle/src/schema/auth.ts`
- [ ] Handler Hono : `app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))`
- [ ] Client React : `createAuthClient` dans `apps/app/src/adapters/auth-client.ts`
- [ ] Plugins : `organization` (multi-tenant dès J1, cf section dédiée), `twoFactor`, `passkey`, `magicLink`, `stripe` (cf section Stripe)
- [ ] Session côté serveur via middleware Hono → injecté dans `c.var.user`
- [ ] Pages `/sign-in`, `/sign-up`, `/forgot-password`, `/verify-email` en `features/auth/`
- [ ] Middleware route `beforeLoad` (TanStack Router) → redirect si non auth
- [ ] Cookies : `httpOnly` + `sameSite=lax` + `secure` en prod

---

## Multi-tenant — plugin `organization` BetterAuth

**Pourquoi dès J1** : migrer single-user → multi-tenant après coup = enfer (backfill `organizationId` partout, owners orphelins, réécrire toutes les queries). L'inverse est gratuit : si finalement B2C, chaque user a une "personal org" auto-créée invisible.

- [ ] Plugin `organization` activé dans `auth` config
- [ ] Schémas Drizzle générés : `organization`, `member`, `invitation` (+ `team` si besoin)
- [ ] Auto-création d'une org perso à l'inscription (`databaseHooks.user.create.after`)
- [ ] Session enrichie avec `activeOrganizationId` → middleware Hono qui le pousse dans `c.var.orgId`
- [ ] **Toutes les tables métier** ont une FK `organizationId` dès la 1ère migration (jamais ajouté après)
- [ ] Helper Drizzle `withOrg(qb, orgId)` pour scoper systématiquement les queries
- [ ] Pages : `/org/new`, `/org/settings`, `/org/members`, `/org/invitations` en `features/organization/`
- [ ] Switcher d'org dans le header (`authClient.organization.setActive(id)`)
- [ ] Invitations par email (template Resend dédié)
- [ ] Rôles : `owner`, `admin`, `member` (custom roles plus tard si besoin)
- [ ] Stripe customer = **par organization**, pas par user (le plugin Stripe le supporte nativement)

---

## Billing — Stripe via plugin BetterAuth

**Pourquoi** : `@better-auth/stripe` (officiel, fin 2025) wrappe customer creation, subscriptions, customer portal, webhooks, sync DB. Plus besoin d'écrire 600 lignes de glue Stripe à la main.

- [ ] Install `@better-auth/stripe` + `stripe` SDK
- [ ] Plugin déclaré dans `auth` config : products, prices, trial, webhook secret
- [ ] Webhook endpoint auto-monté par le plugin → `/api/auth/stripe/webhook`
- [ ] Customer Portal : bouton qui call `authClient.subscription.billingPortal()`
- [ ] Checkout : `authClient.subscription.upgrade({ plan: "pro" })`
- [ ] Hook `useSubscription()` dans `apps/app/src/adapters/queries/` (cross-feature)
- [ ] Gating UI via `subscription.status === "active"` (pas de feature flag custom)
- [ ] Tests Stripe via `stripe listen` en dev (forward webhooks)

---

## Email — Resend (templates dashboard)

**Pourquoi** : templates gérés depuis le dashboard Resend (no code, no rebuild pour changer un wording), versioning intégré, A/B test natif. Resté pragmatique : on appelle juste l'API par template ID.

- [ ] Install `resend`
- [ ] Service `apps/api/src/adapters/services/email.service.ts` → wrapper minimal `sendTemplate(templateId, to, data)`
- [ ] Templates créés dans dashboard Resend, IDs en env (`RESEND_TPL_WELCOME`, `RESEND_TPL_RESET_PWD`, etc.)
- [ ] Webhook Resend pour bounces/complaints → `routes/webhooks/resend.ts`
- [ ] Domain DNS (SPF/DKIM/DMARC) check dans le README
- [ ] BetterAuth : brancher `sendVerificationEmail` / `sendResetPassword` sur le service Resend

---

## Storage — Cloudflare R2 (prod) + MinIO (dev)

**Pourquoi** : R2 = pas d'egress fees, S3-compatible. MinIO local = même API S3 → un seul code, switch via env.

- [x] MinIO ajouté dans `docker-compose.yaml` (ports 9000 API, 9001 console, bucket `clean-stack` auto-créé)
- [ ] Install `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
- [ ] Service `apps/api/src/adapters/services/storage.service.ts` (presigned URLs upload + download)
- [ ] Env : `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
  - Dev : `http://localhost:9000` + `minioadmin` / `minioadmin` / bucket `clean-stack`
  - Prod : R2 endpoint + R2 access keys
- [ ] Route `POST /uploads/presign` → renvoie URL signée (auth required via BetterAuth middleware)
- [ ] Hook `useUpload()` côté app (PUT direct vers presigned URL, pas de proxy via API)
- [ ] Console MinIO : http://localhost:9001 (`minioadmin` / `minioadmin`)

---

## Règles transverses

1. **Pas de DDD pour ces intégrations** — `adapters/services/*` côté api, `adapters/*` + `_hooks/*` côté app. Si un concept devient métier (ex: `Subscription` avec règles propres), promouvoir dans `domain/` à ce moment-là.
2. **Env validé par zod** dans `apps/api/common/env.ts` et `apps/app/src/common/env.ts`.
3. **Webhooks** : tous sous `routes/webhooks/<provider>.ts`, vérification de signature obligatoire avant tout traitement.
4. **Secrets** : jamais en commit, `.env.local` (gitignore) + 1Password/Doppler en prod.
