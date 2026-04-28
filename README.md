# clean-stack

Generic monorepo boilerplate for Clean Architecture + DDD projects.

## Stack

- **Runtime**: Bun 1.3+ (api, scripts, tests)
- **API**: Hono on native `Bun.serve()` (`bun build` → 7ms cold builds)
- **App**: Vite 8 + React 19 + TanStack Router + TanStack Query + Tailwind 4
- **DB**: Drizzle ORM + Postgres
- **DDD primitives**: `@packages/ddd-kit` (Result, Option, Entity, Aggregate, ValueObject, DomainEvent)
- **DI**: inwire
- **Tooling**: pnpm + Turborepo + Biome + Husky + commitlint + semantic-release + knip + jscpd

## Quick start

```bash
pnpm install
docker compose up -d   # start Postgres
pnpm db:push           # push initial schema (none yet)
pnpm dev               # start everything in parallel
```

Scoped dev:

```bash
pnpm dev:api
pnpm dev:app
```

## Layout

```
apps/
  api/   Hono on Bun (Clean Arch + DDD layout: domain/, application/, adapters/, di/, routes/)
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
