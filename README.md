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

## Quick start

```bash
git clone https://github.com/axelhamil/clean-stack && cd clean-stack
pnpm install
docker compose up -d         # Postgres 17 (port 5433) + MinIO (9000/9001)
pnpm db:push                 # push schemas (auth + business)
pnpm dev                     # API + App in parallel (Turbo TUI)
```

Scoped dev:

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
