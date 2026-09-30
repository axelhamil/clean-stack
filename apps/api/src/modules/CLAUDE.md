# Module rules (per bounded context)

Loaded when working inside any `modules/<context>/`. Layer-specific. Higher-level concerns (CQRS, DI wiring, RPC, auth, logging, storage, org scoping) live in `apps/api/CLAUDE.md`. Cross-cutting code patterns (`Result`, `Option`, `ScopedRepo`, use-case-vs-service) are in your global `~/.claude/rules/40-quality.md`.

## Module structure

```
modules/<context>/
  domain/                       ONLY when context has DDD primitives extending ddd-kit. No `domain/` for anemic data, those live with the port. Empty `domain/` = cargo-cult.
  application/
    ports/                      Module-private interfaces + failure shape + data records. Cross-module ports → `shared/ports/` (promotion on 2nd consumer).
    use-cases/                  One file per use case (orchestrates ≥ 1 aggregate with infra)
    services/                   Pure-infra orchestration, `<Noun>Service` with N methods. May `this.<other>`, never inject service into another.
    dto/                        Zod (`<verb-noun>.dto.ts`, `<Noun>Input = z.infer<...>`)
    event-handlers/             Side effects on domain events
  infrastructure/
    repositories/               Drizzle impls of module-private ports: `*.store.ts` (`I<Noun>Store`) for persistence without an aggregate (projections, settings, read models), `*.repository.ts` only where the port models an owned record with a lifecycle
    mappers/                    Domain ↔ DB
    services/                   Port impls when port is module-owned. Cross-module impls → `shared/services/`.
  routes.ts                     Hono sub-app (chained `.route()`), public surface. Extra surfaces sit next to it as `<name>.routes.ts`
  <context>.schema.ts           Drizzle table(s) the module owns, when not in `@packages/drizzle`
  internal.routes.ts            Hono sub-app gated by `internalLayers`, cron/job (header comment states gate)
  module.ts                     inwire `defineModule()`, augments `inwire.AppDeps`, registers via `.add()`. NEVER re-exports routes (cycle).
  __TESTS__/                    All tests at module root, never colocated. Mirrors source filenames.
```

**The tree above is the target shape for a business module; no module has a `domain/`, `use-cases/` or `mappers/` folder today.** Every shipped module is infra-only (config + `<Noun>Service`/store + routes): orchestration defaults to `application/services/`, and row mapping stays inside the store. Add `domain/` and `use-cases/` only when the Decisor below says an aggregate exists. Billing gates (`requireFeature`/`requirePlan`/seat checks + `requireQuota`/`reserveQuota` quota gates) live in `shared/middleware/billing.middleware.ts` + `shared/db/quota-reservation.ts` + org-plugin hooks, not use cases. `modules/quotas/` is a store-only infra module (`IQuotaUsageStore` + `quota_usage` table, §8-instrumented), no service/routes. See global `~/.claude/rules/40-quality.md` §"DDD scope" for why billing/compliance are never DDD.

## Architecture rule (module-specific)

**Domain has zero external imports** (only `@packages/ddd-kit`+`zod`). **Application layer has zero infrastructure imports**: `application/**` import only `@packages/ddd-kit`, `zod`, ports/types they own. NEVER `@packages/drizzle`, `better-auth`, `@aws-sdk/*`, `resend`, or any provider concrete type (`PgTransaction`, `NodePgTransaction`, `SessionUser`, `SessionData`, `S3Client`, …). **Why**: application says *what*, not *how*, a use case importing a provider type survives a swap only by accident, exactly what ports exist to enable. **One exception**: `apps/api/src/shared/transaction.ts` aliases `type ITransaction = Transaction` so repos thread the tx natively typed (`tx ?? db` works without `as unknown as`). Type-only, single swap-point. Cross-aggregate references use VO IDs (`UserId`, future `OrgId`), never `SessionUser["id"]` or `string`.

## DDD primitives: when to use what

| Primitive | Use when… |
|---|---|
| `Result<T, E>` | Domain failure (validation, not-found, business rule). `Result.ok()` with no argument is overloaded to `Result<void, E>`, and its single type parameter is the error: `Result.ok<string>()` compiles, but as `Result<void, string>`. What the type system guarantees is that a no-argument success can never be assigned to `Result<string, E>` (pinned by a `@ts-expect-error` in `packages/ddd-kit`), so a success carrying a real value must pass it. |
| `Option<T>` | Absence is a valid state. **A port never expresses absence as `T \| null`**: `Result<Option<T>, E>` for a lookup that may find nothing, `Option<T>` for a record field that may be unset. `null` exists only inside a store while mapping a driver row, and is converted with `Option.fromNullable` before it leaves. **Why**: `T \| null` forces every caller to remember a guard the type does not impose; `Option` makes the check structural. The whole API was back-filled to this in Aug 2026 after the convention was found applied only to recent code. |
| `AppError<TCode>` | Typed error suffix auto-mapping to HTTP via `httpStatusFromCode` (`*_NOT_FOUND`→404, `*_FORBIDDEN`→403). |
| `IUnitOfWork<TTx>` | ≥ 2 repo writes that must be atomic. |
| `UserId` (VO) | First aggregate referencing a user. Validates UUID, prevents `OrderId`↔`UserId` confusion. |
| `Aggregate<TProps>` | Business concept with invariants, identity, lifecycle, emits domain events. Infra orchestration is NOT an aggregate. |
| `Entity<TProps>` | Inside an aggregate, child with identity but no independent lifecycle. |
| `ValueObject<T>` | Typed primitive with validation: `Email`, `Money`, `Slug`. |
| `DomainEvent`+`onEvent`+`EventCollector` | Aggregate emits on state change (`addEvent`); flushed to outbox automatically by `uow.run()`; handlers via `onEvent(type, factory)` auto-discovered by dispatcher. See `docs/EVENTS.md`. |
| `BaseRepository<T>` | Genuinely global aggregate (audit logs, system config). Rare. |
| `ScopedRepository<T, TScope>` | Owned aggregate carrying `userId`/`organizationId`. Default for any business table once an aggregate exists; today's stores scope by explicit `userId`/`organizationId` params. |

**Decisor "do I need an Aggregate?"**: rule fits in `array.includes()`/`count(*)`/config lookup → infra orchestration, stay flat. Entity has invariant only it can enforce (`<Aggregate>.canCancel()` checks multiple props) → aggregate. SQL counts are not invariants.

## Domain Events (zero-plumbing rail)

Events *added* in aggregate methods (`this.addEvent(...)`), then **automatically** flushed into the outbox by `IUnitOfWork.run()`. The use case writes ZERO event-dispatch code:

```typescript
async execute(input: PlaceOrderInput): Promise<Result<Order, OrderError>> {
  return this.uow.run(async (tx) => {
    const order = Order.place(input);          // addEvent(OrderPlaced) inside
    return this.repo.save(order, tx);           // pulled into ALS collector
  });
  // → outbox_event INSERT happens HERE, in the same TX, before COMMIT
  // → audit_log + webhook_delivery rows written by built-in subscribers
}
```

**Hard rules**:
- `uow.run()` cannot be nested: it always opens from `db` (independent commit, no savepoint), and a rolled-back inner write could not un-collect the in-memory `EventCollector` buffer, so its events would still be emitted. `TransactionService.run()` throws if `EventCollector.hasContext()` is already true.
- A callback that resolves to a failed `Result` rolls the whole transaction back (writes and collected events) and `run()` resolves to that `Result`. Return the failure, never throw a sentinel to force the rollback. **Why**: a failure is all or nothing without the caller remembering to throw, and a thrown sentinel has to be told apart from a real crash in every `catch`. Proven against Postgres by `check:uow-rollback`.
- Repos must call `trackEventsOnSuccess(result, aggregate)` (helper in `@packages/drizzle`) inside their `save`/`create` impl, otherwise events stay on the aggregate buffer and are silently lost.
- `addEvent()` outside `uow.run()` = events lost (warning logged in dev via `EventCollector.setOutOfContextLogger`).

**Outside an aggregate** (every shipped module today), a write and its `emitEvent(outbox, ..., tx)` share one `ITransactionService.run(tx)`. Give every store write method an optional `tx?: ITransaction`, and assert the tx handle itself in tests: a call count passes even when both writes run outside the transaction.

**Subscribers built-in** to the dispatcher (no glue): `AuditEventSubscriber` (writes `audit_log` if event in `RETENTION_MAP`) + `WebhookFanoutSubscriber` (creates `webhook_delivery` rows for matching org-scoped endpoints) + `NotificationFanoutSubscriber` (creates notification rows and schedules email digests, honouring user/org preference precedence).

**User-defined handlers** via `onEvent(type, factory)` + inwire binding, auto-discovered at boot via `EVENT_HANDLER_SYMBOL`:

```typescript
b.add(
  "NotifyCustomerOnOrderPlaced",
  onEvent(EventTypes.ORDER_PLACED, (c) => async (event) => {
    await c.IEmailService.sendTemplate("order_confirmed", ...);
  }),
)
```

User handlers run **post-commit** (best-effort, isolated). Built-in subscribers run **inside the dispatch TX** (atomic with `markDispatched`).

See `docs/EVENTS.md` for full DX guide + retention map + BetterAuth bridge specifics.

## Testing

BDD style. One test file per service, use case, store/repository, DTO or route file under `__TESTS__/` (services group `describe` per method). Mock at repository/port level. Test `Result`/`Option` state transitions. Outbox and unit-of-work doubles (`noopOutbox`, `recordingOutbox`, `passthroughUow`) come from `shared/__TESTS__/outbox-fakes.ts`, never a local copy.

**Substitute through the seam the code already has, before reaching for a module replacement.** A handler that takes its collaborators as arguments, a route factory that takes a `deps` object, a class that takes its repository in the constructor: pass a fake and the substitution is scoped by construction, typed against the real port, and visible in the test's first ten lines. Replacing the module is the fallback for the cases with no seam (a module-level singleton like `db`, a third-party SDK, a lib the code imports directly). **Why**: injection cannot reach past the object under test, so it cannot be the reason another test's verdict changed, and the day a collaborator gains a method, the compiler names every fake that must grow, which no module stand-in ever does. `github-key-verifier.test.ts` is the reference shape. The isolation rule in `../shared/CLAUDE.md` is what makes the fallback safe; it is not a reason to prefer it.

## Common patterns

```typescript
// Reference shapes from @packages/ddd-kit; no aggregate ships in apps/api yet
Result.ok(value); Result.fail(error); Result.combine([r1, r2, r3]);
Result.ok();                        // void payload only, Result<void, E>
Option.some(value); Option.none(); Option.fromNullable(value);
opt.isSome() ? opt.unwrap() : null; // unwrap only behind a guard; None.unwrap() throws

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
```
