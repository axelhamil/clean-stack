# CLAUDE.md

Generic monorepo boilerplate. Clean Architecture + DDD. No business features included.

## Stack

- **Runtime**: Bun 1.3+ (api + scripts), Node 24.15+ for tooling
- **API**: Hono on native `Bun.serve()` — `bun build` (prod, ~7ms), `bun --hot` (dev)
- **App**: Vite 8 + React 19 + TanStack Router + TanStack Query + Tailwind 4 (`@tailwindcss/vite`)
- **DB**: Drizzle ORM + Postgres 17 (Docker, port `5433` to avoid collisions with other local Postgres)
- **DI**: `inwire`
- **Primitives**: `@packages/ddd-kit` (`Result<T,E>`, `Option<T>`, `Entity`, `Aggregate`, `ValueObject`, `UUID`, `DomainEvent`, `BaseRepository`, `UseCase`)
- **Packages tooling**: `tsup` (esbuild) for `ddd-kit` + `drizzle` build
- **Repo tooling**: pnpm + Turborepo (TUI + daemon + fine-grained inputs + `with`) + Biome + Husky + commitlint + semantic-release + knip + jscpd
- **Testing**: `bun test` (api) + `vitest` (packages, app)

## Layout

```
apps/
  api/
    src/
      domain/                  Aggregates, Entities, Value Objects, Domain Events
      application/
        ports/                 Interfaces (repositories, services)
        use-cases/             One file per use case
        dto/                   Zod schemas
        event-handlers/        Side effects on domain events
      adapters/
        middleware/            Hono middleware (auth, error, rate-limit)
        services/              External service implementations
        repositories/          Drizzle repositories
        mappers/               Domain <-> DB
      routes/                  Hono route registration
      di/
        container.ts           inwire container
        modules/               One module per bounded context
    common/env.ts              Validated env (zod)
  app/
    src/
      main.tsx                 Provider tree (Router, QueryClient)
      routes/                  TanStack Router file-based routes
      features/                One folder per user workflow
      entities/                Cross-feature entity hooks + display components
      shared/                  Zero-business infrastructure
packages/
  ddd-kit                      DDD primitives
  drizzle                      DB client + TransactionService
  test                         Shared vitest config
  typescript-config            tsconfig presets
  ui                           shadcn/ui components
```

## Architecture rules

1. **Domain has zero external imports** (only `@packages/ddd-kit` + `zod`).
2. **No `throw` in domain or application** — return `Result<T, E>`.
3. **No `null` or `undefined` for absence** — use `Option<T>`.
4. **Value Objects validate via zod** in `protected validate()`.
5. **Transactions managed in controllers** (route handlers), passed to use cases.
6. **All dependencies injected** via inwire DI. No service locators inside use cases.
7. **No barrel `index.ts` files**; import directly from the file.
8. **Self-documenting code** — no inline comments unless the WHY is non-obvious.
9. **Only `get id()` getter on aggregates**. Access other props via `entity.get('propName')`.

## CQRS

- **Commands** (writes): Controller → Use Case → Aggregate → Repository → EventDispatcher → Handlers
- **Queries** (reads): Controller → Query (direct ORM access, no use case layer)

## App import direction

`routes/` → `features/` → `entities/` → `shared/`. No lateral cross-feature imports.

## Domain Events

Events are added in aggregate methods (`this.addEvent(...)`), NOT dispatched there. Dispatch happens in use cases AFTER successful persistence:

```typescript
const saveResult = await this.repo.create(aggregate);
if (saveResult.isFailure) return Result.fail(saveResult.getError());
await this.eventDispatcher.dispatchAll(aggregate.domainEvents);
aggregate.clearEvents();
```

## Testing

BDD style. One test file per use case under `__TESTS__/`. Mock at the repository/port level. Test `Result`/`Option` state transitions.

## Common patterns

```typescript
// Result
Result.ok(value);
Result.fail(error);
Result.combine([r1, r2, r3]);

// Option
Option.some(value);
Option.none();
Option.fromNullable(value);

// Aggregate
class Foo extends Aggregate<IFooProps> {
  get id(): FooId { return FooId.create(this._id); }
  static create(props): Foo {
    const e = new Foo({ ...props, createdAt: new Date() }, new UUID());
    e.addEvent(new FooCreatedEvent(e));
    return e;
  }
}

// Value Object
class Email extends ValueObject<string> {
  protected validate(v: string): Result<string> {
    return v.includes("@") ? Result.ok(v) : Result.fail("Invalid email");
  }
}
```

## Turborepo

- `ui: "tui"` + `daemon: true` set in `turbo.json` — no CLI flags needed.
- `globalDependencies`: `biome.json`, `tsconfig.json`, `pnpm-workspace.yaml`, `.env*` — modifying any of these busts every cache.
- `inputs` are scoped per task (build/test/type-check) — README/doc edits do NOT invalidate code caches.
- `build` declares `with: ["type-check"]` — `pnpm build` always runs type-check in parallel for free.
- `dev`, `test:watch`, `db:studio` are `interruptible: true` — clean ctrl+C kill on next reload.

## Useful scripts

- `pnpm dev` / `dev:api` / `dev:app` — TUI panels
- `pnpm dev:affected` / `build:affected` / `test:affected` — only packages changed since main (CI-friendly)
- `pnpm watch:test` / `watch:type-check` — global Turbo watch mode
- `pnpm check:all` — type-check + biome + jscpd + knip + tests

## DB

- `docker compose up -d` from repo root — Postgres on `localhost:5433`
- Schema goes in `packages/drizzle/src/schema/*.ts`
- After adding/modifying schema: `pnpm db:push` (dev) or `pnpm db:generate && pnpm db:migrate` (prod-style migrations)

## Don't

- Add business features without first agreeing on the bounded context.
- Throw in domain or application.
- Use `null` for absence.
- Add `index.ts` barrels.
- Add inline comments that restate what the code does.
- Reintroduce `@hono/node-server`, `tsx`, `tsc-alias` — the API runs on Bun natively.
- Pin Postgres back to port 5432 — collides with other local Postgres instances.
