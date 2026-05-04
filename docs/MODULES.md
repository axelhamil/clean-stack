# Modules

Each module is a vertical slice. Removable in minutes via a documented contract. Cross-cutting ports stay in `shared/ports/` with NoOp adapters always shipped, so dropping a module never breaks call sites — they fall through to no-op silently.

This file doubles as the **commercial sheet**: every module is priced individually (à la carte) and bundled into tiers. Pricing is anchored to what other SaaS boilerplates charge in 2026 (ShipFast €199, Makerkit €199-999, Supastarter €299-1499, Bullet Train €999-1499, SaaS Pegasus €295-995). clean-stack sits in the upper half because of the architecture quality (BetterAuth + multi-tenant from day one + DDD-kit + RGPD core + monorepo Turbo + AI-pair sub-CLAUDE.md), but stays grounded — no €15k tag on a 0-business-logic boilerplate.

## Tier bundles

| Tier | Price | Includes |
|---|---|---|
| **Starter** | **€299** | Core: auth, multi-tenant, access-control, email, storage, RGPD, UI primitives, monorepo tooling, App shell |
| **Pro** | **€799** | Starter + Observability stack (0.4) + Billing (B.1) |
| **Business** | **€1499** | Pro + Admin & impersonation (C.3) + Audit log (C.2) + Security perimeter (C.1) + PATs (C.4) + Webhooks (C.5) |
| **Enterprise** | **€2999** | Business + SSO/SAML/SCIM (C.7) + Status page + SLO dashboards (D.1) + SOC2 readiness docs (D.4) |

All tiers ship as a single repo. Lifetime updates included up to the next major SemVer (currently v2.x). Commercial license, unlimited projects per buyer.

## À la carte modules

Buy any module standalone if the Starter base is enough but a specific Phase-B/C/D piece is missing. Prices reflect implementation depth + ongoing maintenance, not the 5-min wiring time on the buyer's end.

| Module | Phase | Price | Status |
|---|---|---|---|
| Observability stack (Sentry + OTel + Prometheus, removable) | 0.4 | **€149** | planned |
| Billing (Stripe + customer portal + webhooks idempotents + dunning) | B.1 | **€299** | planned |
| Feature & quota gating | B.2 | **€99** | planned |
| Security perimeter (rate-limit + CSP + CSRF) | C.1 | **€149** | planned |
| Audit log (append-only event trail) | C.2 | **€99** | planned |
| Admin & impersonation | C.3 | **€199** | planned |
| API tokens / PATs | C.4 | **€99** | planned |
| Outbound webhooks (HMAC + retry + replay UI) | C.5 | **€149** | planned |
| SSO SAML/OIDC + SCIM provisioning | C.7 | **€699** | planned |
| Status page + Grafana SLO dashboards + alerting | D.1 | **€199** | planned |
| OpenAPI auto-docs (Scalar UI) | D.2 | **€79** | planned |
| In-app notification center | D.3 | **€99** | planned |
| SOC2 Type II readiness checklist | D.4 | **€99** | planned |
| i18n (TanStack locale routes + Lingui) | E.1 | **€99** | planned |
| Capacitor mobile shell | F.1 | **€299** | planned |
| Feature flags (GrowthBook self-hosted) | F.2 | **€99** | planned |

À-la-carte total if every module is bought separately on top of Starter: ~€2 950. Enterprise tier at €2 999 is therefore priced at parity (the bundle premium is the curated stability, not a markup).

---

## Shipped modules (in v2.0+)

### `auth` — BetterAuth singleton

- **What ships**: BetterAuth wired natively on Bun + Hono (no Node shim). Plugins enabled: `twoFactor`, `passkey`, `magicLink`, `bearer` (Capacitor-ready), `organization` (multi-tenant), `customSession`. Email-and-password with mandatory verification.
- **Ports exposed**: none — BetterAuth is a deliberate exception (`auth.ts` singleton imported directly, never wrapped in DI; wrapping recopies `auth.api.*` and loses `auth.$Infer.*`).
- **External deps**: `better-auth`, `@better-auth/passkey`, `@simplewebauthn/server`, Resend (for email hooks).
- **Removal contract**: not removable as a unit — auth is the spine. To swap providers (NextAuth, Clerk, Lucia), the swap is documented in `docs/INTEGRATIONS.md`. ~1 day refactor.

### `multi-tenant + access-control`

- **What ships**: BetterAuth `organization` plugin + `@packages/access-control` SSOT (statements, roles, `authorizeRole` predicate). Personal org auto-created on signup (1:1 user↔org), self-heals on every sign-in. Capability-based authorization mirrored on api (`requireOrgPermission`), route gates (`ensureOrgPermission`), and UI (`<Can>` + `useAuthorization`).
- **Ports exposed**: `OrgPermissions` type — same shape on api + app.
- **External deps**: `better-auth/plugins/organization`.
- **Removal contract**: drop `organization()` from `auth.ts` plugins; remove `requireOrg` middleware mounts. ~30 min for solo-tenant pivot. Schema rollback documented.

### `email`

- **What ships**: `IEmailService` port in `shared/ports/email.port.ts`, `ResendEmailService` adapter in `shared/services/email.service.ts`. Template registry pattern (typed `EmailTemplates` interface), dashboard-managed templates (no MJML in repo), idempotency keys derived from `template + token-hash`, retry on transient failures. Resend's provider-side suppression list guards IP reputation.
- **Ports exposed**: `IEmailService.sendTemplate(template, to, vars, opts)`.
- **External deps**: `resend`.
- **Removal contract**: swap `ResendEmailService` for `PostmarkEmailService` / `SendgridEmailService` — implement `IEmailService`, register in DI, done. ~1h.

### `storage` (uploads module)

- **What ships**: `IStorageService` port in `shared/ports/storage.port.ts`, `S3StorageService` adapter in `modules/uploads/infrastructure/`. Three-step `presign → PUT → confirm` flow (R2 in prod, MinIO in dev — same SDK). Owner-scoped key prefix `<userId>/<scope>/<uuid>-<filename>`, server-verified `HeadObject` on confirm with delete-on-mismatch. Boot-time fail-hard if prod endpoint is localhost or creds are default.
- **Ports exposed**: `IStorageService.{presignUpload, presignDownload, headObject, deleteObject, publicUrlFor}`.
- **External deps**: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.
- **Removal contract**: `trash apps/api/src/modules/uploads` + remove `.addModule(uploadsModule)` + remove `app.route("/uploads", ...)` + remove `<UploadAvatar />` consumer call sites. Front feature isn't shipped yet — only the back module exists. ~10 min.

### `rgpd`

- **What ships**: `modules/rgpd/` full vertical slice. Account export (Art. 20 — JSON archive, signed download URL, 7d link TTL, 24h rate limit) + account deletion (Art. 17 — 7-day grace period, 2FA-gated, sole-owner pre-flight check, automated wipe via internal cron). Front: `<DataExportCard />`, `<RgpdDeletionCard />`, `/legal/data-rights` page (Art. 13/14 transparency).
- **Ports exposed**: `IRgpdRepository` (internal to module). HMAC `internal-fetch` for cron-triggered sweeps.
- **External deps**: `IStorageService` (uploads JSON archive), `IEmailService` (download link delivery).
- **Removal contract**: `trash apps/api/src/modules/rgpd` + `trash apps/app/src/features/rgpd` + remove imports in `account.page.tsx` + drop the 3 RGPD columns in `users` table. ~5 min api side, ~2 min app side, ~1 min schema side.

### `ddd-kit`

- **What ships**: `@packages/ddd-kit` — primitives `Result<T,E>`, `Option<T>`, `Entity`, `Aggregate`, `ValueObject`, `UUID`, `WatchedList`, `BaseRepository`, `ScopedRepository`, `RepoScope`, `IUnitOfWork`, `BaseDomainEvent`/`IDomainEvent`, `EventDispatcher`, `AppErrorException`, `AppError`/`ErrorCode`. 263 vitest cases. Zero external runtime deps (zod is `peerDependencies` optional for `UserId`).
- **Ports exposed**: every primitive listed.
- **Removal contract**: not removable — it's the type-system foundation. Used by every module application layer.

### `ui` (shadcn-pure)

- **What ships**: `@packages/ui` — full shadcn/ui component set + custom primitives (`NavLink`, `BrandLink`, `TextLink`, `ListRow`, `FormTextField`, `FormCheckboxField`, `DestructiveActionDialog`, `BackupCodeList`, `QrCodeFrame`). Theme via `@theme` in `globals.css`, `data-slot` discipline, no `className` color drift in features. View-transitions-API theme toggle.
- **Ports exposed**: every component is a JSX export.
- **External deps**: `radix-ui`, `tailwindcss` 4, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `next-themes`, `sonner`.
- **Removal contract**: swap component-by-component (e.g. switch to NextUI). Each consumer is a colocated JSX import; ~5 min per replacement family.

### App shell

- **What ships**: `apps/app/` — Vite 8 + React 19 + TanStack Router (code-based, lazy chunks via `lazyRouteComponent`, intent prefetch, view transitions) + TanStack Query + AppProviders. `__root` + pathless gates `_guest`/`_protected`/`_shell`/`_org-scope` + settings layout. Command palette (⌘K), org switcher, theme toggle, authorization devtool (dev-only, tree-shaken in prod), 5-min clone tutorial.
- **Removal contract**: not removable — it's the front delivery vehicle.

### Monorepo tooling

- **What ships**: pnpm 10 + Turborepo (TUI, `with: ["type-check"]`, `interruptible: true` on dev tasks, `globalDependencies` glob-aware) + Biome 2 (recommended + extras strict, scoped overrides for shadcn-generated only) + Husky (pre-commit lint-staged, commit-msg commitlint, pre-push full pipeline) + commitlint conventional + semantic-release (with `breaking: true` precedence rule) + jscpd (3% threshold) + knip (all workspaces registered).
- **Removal contract**: drop pnpm workspaces and split into separate repos. ~1 day refactor for a fork that doesn't want the monorepo.

---

## Roadmap modules — preview

Each item below ships with the same architecture discipline (vertical slice, port + adapter, removal contract). Pricing is committed; delivery follows the ROADMAP order.

The full scope of each phase lives in [`ROADMAP.md`](../ROADMAP.md). This file mirrors only the **commercial split** — what a buyer can purchase à la carte once it lands.

| Module | Removal contract preview |
|---|---|
| **Observability** (0.4) | trash `modules/observability/` + remove 1 DI line + remove `/metrics` mount + remove front `Sentry.init` import. Call sites fall through to NoOp impls in `shared/services/`. |
| **Billing** (B.1) | trash `modules/billing/` + remove webhook route + revert `auth.ts` plugin line. Stripe webhook endpoint disappears; subscriptions table can stay empty or be dropped. |
| **Audit log** (C.2) | trash `modules/audit/` + remove `IAuditLogger` adapter (NoOp default keeps call sites alive). |
| **Admin** (C.3) | revert BetterAuth `admin()` plugin line + trash `apps/app/src/features/admin/`. |
| **PATs** (C.4) | trash `modules/tokens/` + drop `pat` table + remove route. |
| **Webhooks** (C.5) | trash `modules/webhooks/` + drop `webhook_endpoint` + `webhook_delivery` tables. |
| **SSO/SCIM** (C.7) | revert `sso()` plugin + trash `modules/scim/` + drop SSO tables. |
| **Status page** (D.1) | external infra (Cachet/Astro standalone) — disconnect from app entirely. |
| **OpenAPI docs** (D.2) | drop `@hono/zod-openapi` route schemas; routes stay typed via Hono RPC regardless. |
| **Notification center** (D.3) | trash `modules/notifications/` + drop `notification` table. |
| **i18n** (E.1) | revert Lingui plugin + drop locale routes; UI strings stay English-only. |
| **Capacitor** (F.1) | trash `apps/mobile/`; bearer plugin in `auth.ts` stays (used elsewhere). |
| **Feature flags** (F.2) | trash `modules/flags/` + remove `useFeatureFlag` consumer call sites (or replace with constant `true`). |

---

## License & redistribution

Commercial license per buyer (covers solo + team-of-≤10). Buyers can ship products built on clean-stack without restriction. They cannot redistribute the boilerplate itself or sell forks. License agreement template in `docs/legal/LICENSE-COMMERCIAL.md` (placeholder — to be populated when commercialization launches).
