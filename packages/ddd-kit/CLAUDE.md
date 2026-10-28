# ddd-kit rules

Domain primitives shared by every backend context: `Result`, `Option`, `Entity`, `Aggregate`, `ValueObject`, `UUID`, `UserId`, `DomainEvent`, `EventCollector`, `onEvent`, `BaseRepository`, `ScopedRepository`, `RepoScope`, `IUnitOfWork`, `AppError`. Auto-loaded under `packages/ddd-kit/`. Where and when to use them in the server: `apps/api/CLAUDE.md`. Cross-cutting rules: `/CLAUDE.md`.

## Layout

```
src/
  primitives/    result, option, uuid
  domain/        entity, aggregate, value-object, user-id, domain-event, watched-list
  application/   repository (Base + Scoped), scope (RepoScope), transaction (IUnitOfWork), error-code (AppError), pagination
  events/        event-collector, event-dispatcher, in-memory-event-dispatcher, on-event, outbox-mapping
  __TESTS__/     one file per primitive
```

The package is framework-free: it imports only Node built-ins and `zod`, nothing from Drizzle, Hono or any provider. A provider concern (transaction type, driver error) enters as a type parameter (`IUnitOfWork<TTx>`), never as an import. **It is published to npm**: top-level `main`/`types`/`exports` point at `src/`, only `publishConfig` swaps in `dist/` at publish time (root rule 4); exports keep their JSDoc, it is the public API.

## Which primitive when

| Primitive | Use when |
|---|---|
| `Result<T, E>` | A domain failure (validation, not-found, business rule). Never throw for these. |
| `Option<T>` | Absence is a valid state. Details below. |
| `AppError<TCode>` | A typed error whose code suffix maps to HTTP through `httpStatusFromCode` (`*_NOT_FOUND` 404, `*_FORBIDDEN` 403, `*_CONFLICT` 409, `*_INVALID` 400, `*_RATE_LIMITED` 429, ...). A new suffix is added to `STATUS_BY_SUFFIX` once, never mapped per route. |
| `IUnitOfWork<TTx>` | ≥ 2 writes that must be atomic. `run()` also flushes collected events before commit, `startTransaction()` does not. |
| `UserId` (VO) | The first aggregate referencing a user. Validates the UUID, prevents `OrderId` ↔ `UserId` mix-ups. |
| `Aggregate<TProps>` | A business concept with invariants, identity and lifecycle that emits domain events. Infra orchestration is NOT an aggregate. |
| `Entity<TProps>` | A child with identity but no independent lifecycle, inside an aggregate. |
| `ValueObject<T>` | A typed primitive with validation (`Email`, `Money`, `Slug`). |
| `DomainEvent` + `onEvent` + `EventCollector` | An aggregate emits on state change (`addEvent`); `run()` flushes to the outbox; handlers register with `onEvent(type, factory)` and are auto-discovered. Declaring the event type: `packages/events/CLAUDE.md`. |
| `BaseRepository<T>` | A genuinely global aggregate (audit logs, system config). Rare. |
| `ScopedRepository<T, TScope>` | An owned aggregate carrying `userId`/`organizationId`; the scope is a `RepoScope` argument, so ownership lives in the repository's `WHERE`, not in a route. |

## Rules

1. **`Result.ok()` with no argument is `Result<void, E>`, and its single type parameter is the error.** `Result.ok<string>()` compiles, but as `Result<void, string>`. What the type system guarantees is that a no-argument success can never be assigned to `Result<string, E>` (pinned by a `@ts-expect-error` in `__TESTS__/result.test.ts`), so a success carrying a real value must pass it. **Why**: `getValue()` must never lie about its type.
2. **A port never expresses absence as `T | null`.** `Result<Option<T>, E>` for a lookup that may find nothing, `Option<T>` for a record field that may be unset. `null` exists only inside a store while mapping a driver row, converted with `Option.fromNullable` before it leaves. **Why**: `T | null` forces every caller to remember a guard the type does not impose; `Option` makes the check structural. `unwrap()` only behind an `isSome()` guard (`None.unwrap()` throws).
3. **Value object**: `extends ValueObject<T>`, `protected validate(value): Result<T>`, built with `X.create(v)` (returns a `Result`), read with `.value`. A closed union is a `type XValue` + a class; the aggregate holds the instances. A primitive is allowed only where there is no rule (free text, counter, date); otherwise it is a value object. Identifiers are always typed.
4. **Aggregate**: constructor `protected`, built through a static factory on the subclass (`create` for a new one, a rehydrating factory for rows). `addEvent` is `protected`: events come from business methods, never from callers. Mutation is by business method returning `void` or `Result<void, E>`, no setters.
5. **Events must be collected inside a unit of work.** `addEvent()` outside `run()` loses the events (the dev warning comes from `EventCollector.setOutOfContextLogger`); `EventCollector.hasContext()` is what makes a nested `run()` fail loudly. Flush mechanics and the rollback contract: `packages/drizzle/CLAUDE.md`.
6. **A scope is a union, not a string**: `RepoScope.user(id)`, `RepoScope.org(id)`, `RepoScope.userInOrg(userId, orgId)`, narrowed with `ScopeOf<"user-in-org">`. A new ownership axis is a new variant here, not an ad hoc argument in a repository.

## Reference shapes

```ts
Result.ok(value); Result.fail(error); Result.combine([r1, r2]);
Option.some(value); Option.none(); Option.fromNullable(raw);

class Email extends ValueObject<string> {
  protected validate(v: string): Result<string> {
    return v.includes("@") ? Result.ok(v) : Result.fail("Invalid email");
  }
}
const email = Email.create("a@b.co");

type NoteScope = ScopeOf<"user-in-org">;
interface INoteRepository extends ScopedRepository<Note, NoteScope> {}
const scope = RepoScope.userInOrg(userId, orgId);
```

## Commands

`pnpm --filter @packages/ddd-kit test` (vitest). A new primitive guarantee gets a test that pins it, type-level guarantees included (`@ts-expect-error`).
