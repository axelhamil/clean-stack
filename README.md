# clean-stack

> The SaaS boilerplate that says no. Auth, billing, multi-tenant, email, storage already wired. Fourteen non-negotiable architecture rules. You clone, you write business logic — everything else is settled.

Bun + Hono on the API · Vite + React 19 + TanStack on the app · Drizzle + Postgres at the bottom · DDD-kit for the business domain · BetterAuth + Stripe + Resend + R2 for the SaaS layer.

## Why this one

Most SaaS boilerplates ship a half-baked auth you'll rip out, a spaghetti billing layer, and zero opinion on what goes where. **clean-stack** starts from the opposite premise:

- **Real auth, not a demo** — BetterAuth (passkeys, 2FA, magic-link, DB-backed sessions), the first auth that runs natively on Bun + Hono with no hacks.
- **Multi-tenant from day one** — `organization` plugin, `organizationId` FK on every business table from the very first migration. Migrating single-user → multi-tenant after the fact is hell; the reverse is free.
- **Wrapped Stripe billing** — `@better-auth/stripe` plugin. Customer portal, subscriptions, signed webhooks, DB sync. Stripe customer = per organization.
- **Resend email** — templates managed from the dashboard, bounces & complaints tracked.
- **S3-compatible storage** — Cloudflare R2 in production (zero egress fees), MinIO in dev (same API, zero divergence).
- **i18n built-in** — locale-aware TanStack routes, type-safe message keys, server-side detection, no missing-key surprises in production.
- **Pragmatic DDD** — reserved for the business logic you actually charge for. Not for billing, not for auth, not for gating. ~70% less code than going full-DDD.
- **Zero-warning pipeline** — Biome, knip, jscpd, type-check, commitlint. Fix before push, never `--no-verify`.
- **AI-pair ready** — A 450-line `CLAUDE.md` shipped at the root: architecture, DDD scope, form contracts, banned anti-patterns. Your agent already knows the rules.

## Stack

| Layer | Choice |
|---|---|
| **Runtime** | Bun 1.3+ (api, scripts, tests) · Node 24+ for tooling |
| **API** | Hono on native `Bun.serve()` (~7 ms cold prod build) |
| **App** | Vite 8 · React 19 · TanStack Router (file-based, prefetch, view transitions) · TanStack Query · Tailwind 4 · full shadcn/ui |
| **Forms** | react-hook-form + `@hookform/resolvers/zod` + shadcn `Form` |
| **Auth** | BetterAuth + plugins `organization`, `twoFactor`, `passkey`, `magicLink`, `stripe` |
| **Billing** | Stripe via `@better-auth/stripe` |
| **Email** | Resend (dashboard templates, bounce webhooks) |
| **Storage** | Cloudflare R2 in prod / MinIO in dev (S3-compatible, presigned URLs) |
| **i18n** | TanStack Router locale routes + typed message catalogs |
| **DB** | Drizzle ORM + Postgres 17 (port 5433 dedicated) |
| **API ↔ App** | Hono RPC (`hc<AppType>`) — end-to-end types, no client to write |
| **DDD** | `@packages/ddd-kit` (Result, Option, Aggregate, Entity, ValueObject, DomainEvent, EventDispatcher, UseCase, QueryHandler) |
| **DI** | inwire (modules per bounded context) |
| **Theme** | `next-themes` + View Transitions API circle reveal |
| **Tooling** | pnpm 10 · Turborepo TUI · Biome · Husky · commitlint · semantic-release · knip · jscpd |

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

```
apps/
  api/                       Hono on Bun
    src/
      domain/                Aggregates, Entities, Value Objects, Domain Events
      application/           Use cases, ports, DTOs, event handlers
      adapters/              Middlewares, repositories, services (auth, email, storage)
      routes/                Hono routes (incl. /api/auth/*, signed webhooks)
      di/                    inwire container + modules per bounded context
  app/                       Vite + React (routes → features → adapters → common)
    src/
      routes/                TanStack Router file-based
      features/<x>/          page.tsx + _components/ + _forms/ + _hooks/ + _schemas/
      adapters/              api-client, auth-client, query-client, storage
      providers/             Provider tree (next-themes, query, router)
      common/                env, format, theme-toggle
packages/
  ddd-kit                    DDD primitives
  drizzle                    DB client + TransactionService + schemas
  test                       Shared Vitest config
  typescript-config          Shared tsconfig presets
  ui                         Full shadcn/ui + typography + theme tokens
```

## Conventions

Read `CLAUDE.md` for the full ruleset (fourteen total): Result/Option, no null, no throw in domain, CQRS, mandatory DI, strict import direction, theme tokens only, shadcn-first, strict HTML semantics (one `<main>` per page), zero-warning pipeline, DDD scope limited to business logic, reusability-first promotion to theme/primitives, etc.

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
