# CLAUDE.md

Generic monorepo boilerplate. Clean Architecture + DDD. No business features included.

## Stack

- **API**: Hono on `@hono/node-server` (plain Node.js)
- **App**: Vite + React 19 + TanStack Router + TanStack Query + Tailwind 4
- **DB**: Drizzle ORM + Postgres
- **DI**: `inwire`
- **Primitives**: `@packages/ddd-kit` (`Result<T,E>`, `Option<T>`, `Entity`, `Aggregate`, `ValueObject`, `UUID`, `DomainEvent`, `BaseRepository`, `UseCase`)
- **Tooling**: pnpm + Turborepo + Biome + Husky + commitlint + semantic-release

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

## Don't

- Add business features without first agreeing on the bounded context.
- Throw in domain or application.
- Use `null` for absence.
- Add `index.ts` barrels.
- Add inline comments that restate what the code does.
