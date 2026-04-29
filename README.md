# clean-stack

Generic monorepo boilerplate for Clean Architecture + DDD projects.

## Stack

- **Runtime**: Bun 1.3+ (api, scripts, tests)
- **API**: Hono on native `Bun.serve()` (`bun build` → 7ms cold builds)
- **App**: Vite 8 + React 19 + TanStack Router (prefetch + view transitions) + TanStack Query + Tailwind 4 + shadcn/ui
- **Forms**: react-hook-form + `@hookform/resolvers/zod` + shadcn `Form` primitives
- **Typography**: shadcn typography (`@packages/ui/components/ui/typography` — `TypographyH1/H2/.../P/Lead/Muted`…)
- **Theme**: `next-themes` (light/dark/system) + View Transitions API circle reveal toggle (`apps/app/src/common/ui/theme-toggle.tsx`)
- **API ↔ App contract**: Hono RPC (`hc<AppType>`) — end-to-end type safety
- **DB**: Drizzle ORM + Postgres
- **DDD primitives**: `@packages/ddd-kit` (Result, Option, Entity, Aggregate, ValueObject, DomainEvent)
- **DI**: inwire
- **Tooling**: pnpm 10 + Turborepo + Biome + Husky + commitlint + semantic-release + knip + jscpd

## Quick start

```bash
pnpm install
docker compose up -d   # start Postgres
pnpm db:push           # push initial schema (none yet)
pnpm dev               # start everything in parallel
```

Scoped dev (Turbo filters):

```bash
pnpm dev --filter=api
pnpm dev --filter=app
```

## Layout

```
apps/
  api/   Hono on Bun (Clean Arch + DDD layout: domain/, application/, adapters/, di/, routes/)
  app/   Vite + React (routes -> features -> adapters -> common)
packages/
  ddd-kit            DDD primitives
  drizzle            DB client + transaction service (schema/migrations are empty)
  test               Shared vitest config
  typescript-config  Shared tsconfig presets
  ui                 Shared shadcn/ui components
```

## Conventions

See `CLAUDE.md` for architecture rules (Result/Option, no null, no throw in domain, CQRS, DI rules, import direction in app, theme tokens only, shadcn-first, HTML semantics, zero-warning pipeline).

## Scripts

```bash
pnpm dev               # Turbo TUI (all apps)
pnpm build             # build all (runs type-check in parallel via `with`)
pnpm test              # all tests (bun test for api, vitest elsewhere)
pnpm type-check        # all workspaces
pnpm check             # Biome lint + format check
pnpm fix               # auto-fix lint/format
pnpm ci:check          # Biome CI mode (used by pre-push)
pnpm check:duplication # jscpd
pnpm check:unused      # knip
pnpm clean             # wipe node_modules + .turbo + dist
```
