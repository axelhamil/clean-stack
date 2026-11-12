# ddd-kit rules

Domain primitives and the ports every backend package shares. Where and when a module uses them: `modules/CLAUDE.md`.

## Layout

```
src/
  primitives/    result, option, uuid (uuidv7 monotonic, UUID, randomUuidV4), canonical-json (`canonicalize`, key-order independent JSON for hashes and idempotency keys)
  domain/        entity, aggregate, value-object, watched-list, domain-event
  application/   repository (Base + Scoped), scope (RepoScope), transaction (IUnitOfWork), unit-of-work-context (the one ambient scope: tx + collected events), error-code (AppError), health-check (`HealthStatus`, `HealthCheckResult`, `HealthCheckFn`: the probe contract every registry and probe shares), db-failure (`createDbFailure(code, logger)`: logs the raw error, returns a failed `Result`), instrumentation (IInstrumentation), noop-instrumentation (`NoOpInstrumentation`, the null object of the port, base of the host logging impl and default of tests and checks), logger (ILogger), pagination
  events/        event-collector, event-dispatcher, in-memory-event-dispatcher, event-handler, on-event, outbox-mapping
  __TESTS__/     one file per primitive
```

Framework-free: it imports only Node built-ins, nothing from Drizzle, Hono, Zod or any provider. A provider concern (driver error) enters as a type parameter (the repositories' `E`), never as an import; the transaction never crosses a port, it lives in the ambient scope. A port that a package needs too (`IInstrumentation`, `ILogger`) lives here, not in an app. **Why**: a package cannot import an app, so a port kept in the app ends up copied as a partial slice in every package that needs it.

## Which primitive when

| Primitive | Use when |
|---|---|
| `Result<T, E>` | A domain failure (validation, not-found, business rule). Never throw for these. |
| `Option<T>` | Absence is a valid state. Details below. |
| `AppError<TCode>` | A typed error whose code suffix maps to HTTP through `httpStatusFromCode` (`*_NOT_FOUND` 404, `*_FORBIDDEN` 403, `*_CONFLICT` 409, `*_INVALID` 400, `*_RATE_LIMITED` 429, ...). A new suffix is added to `STATUS_BY_SUFFIX` once, never mapped per route. |
| `IUnitOfWork` | ≥ 2 writes that must be atomic. `run(work)` hands `work` nothing, joins an open run, and flushes collected events before the outermost commit; stores read the ambient transaction. |
| `Aggregate<TProps, Id>` | A business concept with invariants, identity and lifecycle that emits domain events. Infra orchestration is NOT an aggregate. |
| `Entity<TProps, Id>` | A child with identity but no independent lifecycle, inside an aggregate. |
| `class XId extends UUID<string>` | The identifier of an aggregate or entity, in `<name>-id.ts` of its module, parsed with `XId.parse(raw)`. Passing it as `Id` makes the id argument required and `entity.id` typed. |
| `ValueObject<T, E>` | A typed primitive with validation (`Email`, `Money`, `Slug`); `E` defaults to `string`, set it to a typed code when the caller branches on it. |
| `WatchedList<T>` | A collection inside an aggregate whose additions and removals the repository persists separately. |
| `DomainEvent` + `onEvent` + `EventCollector` | An aggregate emits on state change (`addEvent`); the repository hands them over with `EventCollector.collectFrom(aggregate)` once its write succeeded; `run()` flushes them to the outbox. A handler is `onEvent(type, handlerName, factory, { payload })`, auto-discovered; `IEventDispatcher.run(event, handlerName)` runs one named handler and reports its `HandlerOutcome` (a throw, a failed `Result` or an unknown name is a failure); which handlers are still owed is the caller's bookkeeping. Declaring the event type: `packages/events/CLAUDE.md`. |
| `BaseRepository<T>` | A genuinely global aggregate (audit logs, system config). Rare. |
| `ScopedRepository<T, TScope>` | An owned aggregate carrying `userId`/`organizationId`; the scope is a `RepoScope` argument, so ownership lives in the repository's `WHERE`, not in a route. |
| `IInstrumentation`, `ILogger` | Constructor-injected into every I/O class, app or package. |
| `createDbFailure(code, logger)` | A service or repository `catch` that must log the driver error and return `Result.fail` with its typed code; built once in the constructor from the injected `ILogger`, never per call. |

## Rules

1. **`Result.ok()` with no argument is `Result<void, E>`, and its single type parameter is the error.** `Result.ok<string>()` compiles, but as `Result<void, string>`. What the type system guarantees is that a no-argument success can never be assigned to `Result<string, E>` (pinned by a `@ts-expect-error` in `__TESTS__/result.test.ts`), so a success carrying a real value must pass it. **Why**: `getValue()` must never lie about its type.
2. **A port never expresses absence as `T | null`.** `Result<Option<T>, E>` for a lookup that may find nothing, `Option<T>` for a record field that may be unset. `null` exists only inside a store while mapping a driver row, converted with `Option.fromNullable` before it leaves, and when a route serialises JSON. Not violations: an input DTO whose caller legitimately holds a raw nullable, and a SQL filter where `undefined`/`null`/value mean don't-filter / `IS NULL` / equality. **Why**: `T | null` forces every caller to remember a guard the type does not impose; `Option` makes the check structural. `unwrap()` only behind an `isSome()` guard (`None.unwrap()` throws).
3. **Value object**: `extends ValueObject<T>`, `protected validate(value): Result<T, E>`, built with `X.create(v)` (returns a `Result`), read with `.value`. A closed union is a `type XValue` + a class; the aggregate holds the instances. A primitive is allowed only where there is no rule (free text, counter, date); otherwise it is a value object.
4. **Aggregate**: constructor `protected` (or `private`), built through a static factory on the subclass (`create` for a new one, a rehydrating factory for rows). `addEvent` is `protected`: events come from business methods, never from callers. Mutation is by business method returning `void` or `Result<void, E>`, no setters. `clone(props)` returns the same class and id with its own arrays and watched lists, so editing the clone never edits the original.
5. **Events must be collected inside a unit of work.** `addEvent()` outside `run()` loses the events (the dev warning comes from `EventCollector.setOutOfContextLogger`; a host that stops releases only its own with `releaseOutOfContextLogger`); a nested `run()` collects into its own scope and hands its events to the outermost run only when it succeeds. Flush mechanics and the rollback contract: `packages/drizzle/CLAUDE.md`.
6. **A handler parses the payload it reads.** The event comes back from a jsonb row, so `event.payload` is untrusted: pass `{ payload: parser }` built from the event's schema, the body then receives the parsed payload; a malformed one fails the delivery with `"<type> has a malformed payload"` without running the body. **Why**: silently skipping a malformed payload hides a contract drift; a failed delivery is retried, then dead, and visible.
7. **A scope is a union, not a string**: `RepoScope.user(id)`, `RepoScope.org(id)`, `RepoScope.userInOrg(userId, orgId)`, narrowed with `ScopeOf<"user-in-org">`. A new ownership axis is a new variant here, not an ad hoc argument in a repository.

## Reference shapes

```ts
Result.ok(value); Result.fail(error); Result.combine([r1, r2]);
Option.some(value); Option.none(); Option.fromNullable(raw);

class NoteId extends UUID<string> {}
class Note extends Aggregate<NoteProps, NoteId> {}

class Email extends ValueObject<string> {
  protected validate(v: string): Result<string> {
    return v.includes("@") ? Result.ok(v) : Result.fail("Invalid email");
  }
}
const email = Email.create("a@b.co");

type NoteScope = ScopeOf<"user-in-org">;
interface INoteRepository extends ScopedRepository<Note, NoteScope> {}
```

## Commands

`pnpm --filter @packages/ddd-kit test` (vitest). A new primitive guarantee gets one test that pins it, type-level guarantees included (`@ts-expect-error`); nothing else.
