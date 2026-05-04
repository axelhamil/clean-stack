# Module rules (per bounded context)

Loaded when working inside any `modules/<context>/`. Layer-specific. Higher-level concerns (CQRS, DI wiring, RPC, auth, logging, storage, org scoping) live in `apps/api/CLAUDE.md`. Cross-cutting code patterns (`Result`, `Option`, `ScopedRepo`, use-case-vs-service) are in your global `~/.claude/rules/40-quality.md`.

## Module structure

```
modules/<context>/
  domain/                       ONLY when context has DDD primitives extending ddd-kit. No `domain/` for anemic data — those live with the port. Empty `domain/` = cargo-cult.
  application/
    ports/                      Module-private interfaces + failure shape + data records. Cross-module ports → `shared/ports/` (promotion on 2nd consumer).
    use-cases/                  One file per use case (orchestrates ≥ 1 aggregate with infra)
    services/                   Pure-infra orchestration — `<Noun>Service` with N methods. May `this.<other>`, never inject service into another.
    dto/                        Zod (`<verb-noun>.dto.ts`, `<Noun>Input = z.infer<...>`)
    event-handlers/             Side effects on domain events
  infrastructure/
    repositories/               Drizzle repos (impl of module-private ports)
    mappers/                    Domain ↔ DB
    services/                   Port impls when port is module-owned. Cross-module impls → `shared/services/`.
  routes.ts                     Hono sub-app (chained `.route()`) — public surface
  internal.routes.ts            Hono sub-app gated by `internalLayers` — cron/job (header comment states gate)
  module.ts                     inwire `defineModule()` — augments `inwire.AppDeps`, registers via `.add()`. NEVER re-exports routes (cycle).
  __TESTS__/                    All tests at module root, never colocated. Mirrors source filenames.
```

## Architecture rule (module-specific)

**Domain has zero external imports** (only `@packages/ddd-kit`+`zod`). **Application layer has zero infrastructure imports** — `application/**` import only `@packages/ddd-kit`, `zod`, ports/types they own. NEVER `@packages/drizzle`, `better-auth`, `@aws-sdk/*`, `resend`, or any provider concrete type (`PgTransaction`, `NodePgTransaction`, `SessionUser`, `SessionData`, `S3Client`, …). **Why**: application says *what*, not *how* — a use case importing a provider type survives a swap only by accident, exactly what ports exist to enable. **One exception**: `apps/api/src/shared/transaction.ts` aliases `type ITransaction = Transaction` so repos thread the tx natively typed (`tx ?? db` works without `as unknown as`). Type-only, single swap-point. Cross-aggregate references use VO IDs (`UserId`, future `OrgId`) — never `SessionUser["id"]` or `string`.

## DDD primitives — when to use what

| Primitive | Use when… |
|---|---|
| `Result<T, E>` | Domain failure (validation, not-found, business rule). |
| `Option<T>` | Absence is a valid state. |
| `AppError<TCode>` | Typed error suffix auto-mapping to HTTP via `httpStatusFromCode` (`*_NOT_FOUND`→404, `*_FORBIDDEN`→403). |
| `IUnitOfWork<TTx>` | ≥ 2 repo writes that must be atomic. |
| `UserId` (VO) | First aggregate referencing a user. Validates UUID, prevents `OrderId`↔`UserId` confusion. |
| `Aggregate<TProps>` | Business concept with invariants, identity, lifecycle, emits domain events. Infra orchestration is NOT an aggregate. |
| `Entity<TProps>` | Inside an aggregate, child with identity but no independent lifecycle. |
| `ValueObject<T>` | Typed primitive with validation: `Email`, `Money`, `Slug`. |
| `DomainEvent`+`EventDispatcher`+`WatchedList` | Aggregate emits on state change; handlers react in same module or cross. |
| `BaseRepository<T>` | Genuinely global aggregate (audit logs, system config). Rare. |
| `ScopedRepository<T, TScope>` | Owned aggregate carrying `userId`/`organizationId`. Default for any business table. |

**Decisor "do I need an Aggregate?"**: rule fits in `array.includes()`/`count(*)`/config lookup → infra orchestration, stay flat. Entity has invariant only it can enforce (`<Aggregate>.canCancel()` checks multiple props) → aggregate. SQL counts are not invariants.

## Domain Events

Events *added* in aggregate methods (`this.addEvent(...)`), NOT dispatched there. Dispatch in use cases AFTER successful persistence:

```typescript
const saveResult = await this.repo.create(aggregate);
if (saveResult.isFailure) return Result.fail(saveResult.getError());
await this.eventDispatcher.dispatchAll(aggregate.domainEvents);
aggregate.clearEvents();
```

## Testing

BDD style. One test file per use case/service under `__TESTS__/` (services group `describe` per method). Mock at repository/port level. Test `Result`/`Option` state transitions.

## Common patterns

```typescript
Result.ok(value); Result.fail(error); Result.combine([r1, r2, r3]);
Option.some(value); Option.none(); Option.fromNullable(value);

class Foo extends Aggregate<IFooProps> {
  get id(): FooId { return FooId.create(this._id); }
  static create(props): Foo {
    const e = new Foo({ ...props, createdAt: new Date() }, new UUID());
    e.addEvent(new FooCreatedEvent(e));
    return e;
  }
}
class Email extends ValueObject<string> {
  protected validate(v: string): Result<string> {
    return v.includes("@") ? Result.ok(v) : Result.fail("Invalid email");
  }
}
type NoteScope = ScopeOf<"user-in-org">;
interface INoteRepository extends ScopedRepository<Note, NoteScope> {}
const scope = RepoScope.userInOrg(c.var.userId, c.var.orgId);
const result = await di.UpdateNoteUseCase.execute({ id, body }, scope);
```
