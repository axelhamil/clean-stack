# clean-stack

Generic monorepo boilerplate for Clean Architecture + DDD projects.

## Stack

- **API**: Hono + Node.js
- **App**: Vite + React 19 + TanStack Router + TanStack Query
- **DB**: Drizzle ORM + Postgres
- **Tooling**: Turborepo, Biome, Husky, commitlint, semantic-release
- **DDD primitives**: `@packages/ddd-kit` (Result, Option, Entity, Aggregate, ValueObject, DomainEvent)
- **DI**: inwire

## Quick start

```bash
pnpm install
pnpm db          # start Postgres via docker compose
pnpm db:push     # push initial schema (none yet)
pnpm dev         # start everything in parallel
```

Scoped dev:

```bash
pnpm dev:api
pnpm dev:app
```

## Layout

```
apps/
  api/   Hono + Node.js (Clean Arch + DDD layout: domain/, application/, adapters/, di/, routes/)
  app/   Vite + React (routes -> features -> entities -> shared)
packages/
  ddd-kit            DDD primitives
  drizzle            DB client + transaction service (schema/migrations are empty)
  test               Shared vitest config
  typescript-config  Shared tsconfig presets
  ui                 Shared shadcn/ui components
```

## Conventions

See `CLAUDE.md` for architecture rules (Result/Option, no null, no throw in domain, CQRS, DI rules, import direction in app).

## Scripts

```bash
pnpm type-check        # all workspaces
pnpm check             # Biome lint + format check
pnpm fix               # auto-fix lint/format
pnpm check:duplication # jscpd
pnpm check:unused      # knip
pnpm check:all         # everything + tests
pnpm test
```
