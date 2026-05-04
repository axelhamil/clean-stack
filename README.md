# clean-stack

> The SaaS boilerplate that says no. Auth, multi-tenant, email, storage already wired. Fourteen non-negotiable architecture rules. You clone, you write business logic — everything else is settled.

Bun + Hono on the API · Vite + React 19 + TanStack on the app · Drizzle + Postgres at the bottom · DDD-kit for the business domain · BetterAuth + Resend + R2 for the SaaS layer.

See [`docs/FEATURES.md`](docs/FEATURES.md) for what ships today and [`ROADMAP.md`](ROADMAP.md) for what's next (GDPR/CCPA → Billing → Gating → Admin → Audit log → i18n).

## Lean by design

Built around the [Lean Startup](https://bpifrance-creation.fr/moment-de-vie/lean-startup) loop (Eric Ries) — **Build → Measure → Learn** — where the bottleneck is *Build*. clean-stack collapses that phase to the only thing your customers pay for: your domain.

- **Build** — auth, billing, multi-tenant, email, storage already wired. Day one ships the feature that tests your hypothesis, not six weeks of foundation.
- **Measure** — Stripe checkout, signed webhooks, multi-tenant from the very first migration. Real customers, real dollars, week one. No vanity metrics.
- **Learn** — Clean Architecture isolates your domain. When a hypothesis breaks, you replace use cases — not auth, email, or DI. Pivots stay cheap.

Ship the smallest thing that tests one hypothesis. Read the signal. Iterate or kill. The stack stays out of the way.

## Why this one

Most SaaS boilerplates ship a half-baked auth you'll rip out, a spaghetti billing layer, and zero opinion on what goes where. **clean-stack** starts from the opposite premise:

- **Real auth, not a demo** — BetterAuth (passkeys, 2FA, magic-link, DB-backed sessions), the first auth that runs natively on Bun + Hono with no hacks.
- **Multi-tenant from day one** — `organization` plugin, `organizationId` FK on every business table from the very first migration. Migrating single-user → multi-tenant after the fact is hell; the reverse is free.
- **Capability-based authorization SSOT** — `@packages/access-control` exports `ac`, `roles`, `authorizeRole`. Same predicate enforced server-side (`requireOrgPermission`), at the route gate (`ensureOrgPermission`), and in the UI (`<Can>` + `useAuthorization`).
- **Resend email** — dashboard-managed templates with retry + idempotency; Resend's own suppression list guards IP reputation (hard bounces & complaints auto-blocked at the edge).
- **S3-compatible storage** — Cloudflare R2 in production (zero egress fees), MinIO in dev (same API, zero divergence). Owner-scoped keys, three-step presign → PUT → confirm flow.
- **Pragmatic DDD** — reserved for the business logic you actually charge for. Not for billing, not for auth, not for gating. ~70% less code than going full-DDD.
- **Zero-warning pipeline** — Biome, knip, jscpd, type-check, commitlint. Fix before push, never `--no-verify`.
- **AI-pair ready** — A `CLAUDE.md` shipped at the root: architecture, DDD scope, form contracts, banned anti-patterns. Your agent already knows the rules.

## Stack

| Layer | Choice |
|---|---|
| **Runtime** | Bun 1.3+ (api, scripts, tests) · Node 24+ for tooling |
| **API** | Hono 4 on native `Bun.serve()` (~7 ms cold prod build) |
| **App** | Vite 8 · React 19 · TanStack Router (code-based, prefetch, view transitions) · TanStack Query · Tailwind 4 · full shadcn/ui |
| **Forms** | react-hook-form + `@hookform/resolvers/zod` 4 + shadcn `Form` |
| **Auth** | BetterAuth + plugins `organization`, `twoFactor`, `passkey`, `magicLink`, `bearer` |
| **Access control** | `@packages/access-control` SSOT (statements, roles, `authorizeRole`) consumed by server, route gates and UI |
| **Email** | Resend (dashboard templates, retry + idempotency, provider-side suppression) |
| **Storage** | Cloudflare R2 in prod / MinIO in dev (S3-compatible, presigned URLs) |
| **DB** | Drizzle ORM + Postgres 17 (port 5433 dedicated) |
| **API ↔ App** | Hono RPC (`hcWithType`) — end-to-end types, no client to write |
| **DDD** | `@packages/ddd-kit` (Result, Option, Aggregate, Entity, ValueObject, DomainEvent, EventDispatcher, QueryHandler, AppErrorException) |
| **DI** | inwire (modules per bounded context) |
| **Theme** | `next-themes` + View Transitions API circle reveal |
| **Tooling** | pnpm 10 · Turborepo TUI · Biome 2 · Husky · commitlint · semantic-release · knip · jscpd |
| **Roadmap** | Stripe billing, feature/quota gating, admin & impersonation, audit log, GDPR/CCPA, i18n — see [`ROADMAP.md`](ROADMAP.md) |

## 5-minute clone tutorial

From zero to your first business feature, end-to-end. Everything below assumes Bun 1.3+, Node 24+, pnpm 10, Docker.

### 1. Bootstrap (60 sec)

```bash
git clone https://github.com/axelhamil/clean-stack my-saas && cd my-saas
pnpm install
cp .env.example .env                    # default values work for local dev
docker compose up -d                    # Postgres 17 (port 5433) + MinIO (9000/9001)
pnpm db:push                            # apply auth + business schemas
pnpm dev                                # API on :3000, App on :5173 (Turbo TUI)
```

Open `http://localhost:5173` → sign up with any email → BetterAuth creates your user + a Personal org + a session. You're now in the app.

### 2. Adopt the boilerplate (60 sec)

```bash
# rename the project
sed -i 's|axelhamil/clean-stack|<your-org>/<your-repo>|g' README.md package.json

# wipe history if you want a fresh start
rm -rf .git && git init && git add . && git commit -m "init from clean-stack"
```

### 3. Trim what you don't need (60 sec)

The boilerplate ships features you may not want. Removability is **5 minutes per feature** :

```bash
# don't need GDPR (e.g. you're not in EU)?
trash apps/app/src/features/gdpr           # the front bundle (cards, forms, hooks)
# remove its 2 imports in apps/app/src/features/account/account.page.tsx
# (TS will scream, just delete the <DataExportCard /> + <GdprDeletionCard /> lines)

# don't need billing?
trash apps/app/src/features/billing        # the route disappears
# remove `billingRoute` from apps/app/src/router.tsx addChildren
# remove `/settings/billing` entry from SETTINGS_TABS in shared/components/contextual-tabs.tsx

# don't need uploads?
trash apps/api/src/application/use-cases/*upload* apps/api/src/adapters/services/storage*
# remove uploads DI registrations from apps/api/src/di/container.ts
```

`trash` is `gio trash` (recoverable). `pnpm type-check` will list every consumer of the deleted code — fix until green.

### 4. Add your first business feature (90 sec)

```bash
# back: a new module
mkdir -p apps/api/src/modules/notes/{domain,application/{use-cases,ports,dto},infrastructure/{repositories,mappers}}
# write your aggregate in domain/note.aggregate.ts (use ddd-kit primitives — Aggregate, ValueObject)
# write port + use-case + drizzle repo + dto
# expose `routes.ts` with /api/notes/* + `module.ts` with registerNotes(c, app)
# wire in apps/api/src/di/container.ts and apps/api/src/index.ts (2 lines each)

# DB:
echo "// notes table" >> packages/drizzle/src/schema/notes.ts
echo "export * from './notes';" >> packages/drizzle/src/schema/index.ts
pnpm db:push

# front: a new feature folder
mkdir -p apps/app/src/features/notes/{components,forms,hooks}
# write notes.route.tsx + co-located NotesPage component
# wire in apps/app/src/router.tsx (one line in addChildren)
```

End-to-end typed via Hono RPC: the route file imports `api.notes.$post({...})` and TS knows the input/output shape.

### 5. Ship (30 sec)

```bash
pnpm ci:check                           # Biome + type-check + knip + jscpd, all clean
git checkout -b feat/notes
git add . && git commit -m "feat(api): add notes aggregate + module"
gh pr create                            # squashed conventional-commit history → semantic-release picks it up
```

Total: ~5 min from `git clone` to your first business feature shipped. The stack stays out of the way — you write business logic, everything else is settled.

### Scoped dev (anytime)

```bash
pnpm dev --filter=api
pnpm dev --filter=app
```

## Layout

Vertical slice on both sides. Back: one folder per bounded context with its own DDD layers. Front: code-based routing — features own their routes via `<name>.route.tsx` factories assembled in a single `router.tsx`. No `routes/` folder, no codegen.

```
apps/
  api/                       Hono on Bun
    src/
      shared/                Cross-cutting: middleware, env, logger
      modules/<context>/     One folder per bounded context (auth, uploads, organizations, gdpr, …)
        domain/              Aggregates, Entities, Value Objects, Domain Events
        application/         Use cases, ports, services, DTOs, event handlers
        infrastructure/      Drizzle repositories, mappers, port impls (S3, Resend)
        routes.ts            Hono sub-app
        module.ts            registerXxx(c, app) — DI .add() chain + app.route() mount
      di/container.ts        Composition root (chains module registers, exports `c.build()`)
      auth.ts                BetterAuth singleton
      index.ts               Server entry — pipeline + module registration list
  app/                       Vite + React (router.tsx → features → shared)
    src/
      main.tsx               createRoot + <AppProviders />
      router.tsx             Code-based routing: layouts/gates inline + routeTree assembly
      features/<x>/          <name>.route.tsx + components/, forms/, hooks/, schemas
      shared/                Cross-cutting: api/, auth/, components/, env.ts, app-providers.tsx, utils.ts
packages/
  access-control             BetterAuth access-control SSOT (statements, roles, authorizeRole)
  ddd-kit                    DDD primitives (Result, Option, Aggregate, ScopedRepository, …)
  drizzle                    DB client + TransactionService + schemas
  test                       Shared Vitest config
  typescript-config          Shared tsconfig presets
  ui                         shadcn/ui + typography + theme tokens + custom primitives (NavLink, BrandLink, TextLink, ListRow, FormTextField, DestructiveActionDialog, BackupCodeList)
```

## Conventions

Read `CLAUDE.md` for the full ruleset: Result/Option, no null, no throw in domain, CQRS, mandatory DI, strict import direction, theme tokens only, **shadcn-first and shadcn-pure** (use the actual slots — `CardHeader`/`CardTitle`/`CardContent`, never patch with `pt-6` / `space-y-4`; no custom outside the theme or primitive), strict HTML semantics (one `<main>` per page), zero-warning pipeline, DDD scope limited to business logic, reusability-first promotion to theme/primitives, `interface` for component props, `void navigate(...)` in mutation callbacks.

UI composition follows the **`asChild` pattern**: a primitive owns the *style* (e.g. `NavLink` = muted color + hover transition), and TanStack `<Link>` owns the *navigation*. Wire them via `<NavLink asChild><Link to="." hash="x">…</Link></NavLink>`. Never style raw `<a>` tags inside features.

## Email DNS (mandatory before production)

Gmail (Feb 2024), Yahoo (Feb 2024) and Microsoft Outlook (May 2025) all reject unauthenticated bulk senders with `550 5.7.515`. Three records to publish on the sending domain:

- **SPF** — `TXT @  "v=spf1 include:amazonses.com ~all"` (Resend handles the rest).
- **DKIM** — three CNAME records generated by Resend on domain verification (`Domain Settings → Add domain`).
- **DMARC** — `TXT _dmarc  "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com"` to start. Watch the aggregate reports for two weeks, then progress `p=none` → `p=quarantine` → `p=reject` once SPF/DKIM alignment is stable.

For bulk / marketing email (>5k/day, deferred until the first newsletter ships), Gmail/Yahoo/Microsoft additionally require `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) headers and a working `POST /unsubscribe` endpoint. Transactional auth emails (verify, reset, magic-link) are exempt.

Resend's domain-scoped suppression list automatically blocks future sends to hard-bounced or complained addresses — IP reputation is guarded out of the box, no webhook required.

## Roadmap & integrations

`ROADMAP.md` details the implementation of integrations (BetterAuth, Stripe, Resend, R2/MinIO, i18n) with their constraints, schemas and extension points.

## Scripts

```bash
pnpm dev                    # Turbo TUI (all apps)
pnpm build                  # full build (type-check in parallel via `with`)
pnpm test                   # all tests (bun test for the api, vitest elsewhere)
pnpm type-check             # all workspaces
pnpm check                  # Biome lint + format check
pnpm fix                    # auto-fix lint/format
pnpm ci:check               # Biome CI mode (used by pre-push)
pnpm check:duplication      # jscpd
pnpm check:unused           # knip
pnpm db:push                # push schema without a migration (dev)
pnpm db:generate            # generate a migration
pnpm db:migrate             # apply migrations (prod-style)
pnpm db:studio              # Drizzle Studio
pnpm clean                  # wipe node_modules + .turbo + dist
```

## License

MIT
