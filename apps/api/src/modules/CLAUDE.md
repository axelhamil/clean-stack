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

**Infra-only modules** (`billing`, `consents`, `policies`, `quotas`) have no `domain/` layer — config + service/store + routes only. Billing gates (`requireFeature`/`requirePlan`/seat checks + `requireQuota`/`reserveQuota` quota gates) live in `shared/middleware/billing.middleware.ts` + `shared/db/quota-reservation.ts` + org-plugin hooks, not use cases. `modules/quotas/` is a store-only infra module (`IQuotaUsageStore` + `quota_usage` table, §8-instrumented), no service/routes. See global `~/.claude/rules/40-quality.md` §"DDD scope" for why billing/compliance are never DDD.

## Architecture rule (module-specific)

**Domain has zero external imports** (only `@packages/ddd-kit`+`zod`). **Application layer has zero infrastructure imports** — `application/**` import only `@packages/ddd-kit`, `zod`, ports/types they own. NEVER `@packages/drizzle`, `better-auth`, `@aws-sdk/*`, `resend`, or any provider concrete type (`PgTransaction`, `NodePgTransaction`, `SessionUser`, `SessionData`, `S3Client`, …). **Why**: application says *what*, not *how* — a use case importing a provider type survives a swap only by accident, exactly what ports exist to enable. **One exception**: `apps/api/src/shared/transaction.ts` aliases `type ITransaction = Transaction` so repos thread the tx natively typed (`tx ?? db` works without `as unknown as`). Type-only, single swap-point. Cross-aggregate references use VO IDs (`UserId`, future `OrgId`) — never `SessionUser["id"]` or `string`.

## DDD primitives — when to use what

| Primitive | Use when… |
|---|---|
| `Result<T, E>` | Domain failure (validation, not-found, business rule). `Result.ok()` with no argument is overloaded to `Result<void, E>` — a success carrying a real value must pass it, so `Result.ok<string>()` no longer compiles. |
| `Option<T>` | Absence is a valid state. **A port never expresses absence as `T \| null`** — `Result<Option<T>, E>` for a lookup that may find nothing, `Option<T>` for a record field that may be unset. `null` exists only inside a store while mapping a driver row, and is converted with `Option.fromNullable` before it leaves. **Why**: `T \| null` forces every caller to remember a guard the type does not impose; `Option` makes the check structural. The whole API was back-filled to this in Aug 2026 after the convention was found applied only to recent code. |
| `AppError<TCode>` | Typed error suffix auto-mapping to HTTP via `httpStatusFromCode` (`*_NOT_FOUND`→404, `*_FORBIDDEN`→403). |
| `IUnitOfWork<TTx>` | ≥ 2 repo writes that must be atomic. |
| `UserId` (VO) | First aggregate referencing a user. Validates UUID, prevents `OrderId`↔`UserId` confusion. |
| `Aggregate<TProps>` | Business concept with invariants, identity, lifecycle, emits domain events. Infra orchestration is NOT an aggregate. |
| `Entity<TProps>` | Inside an aggregate, child with identity but no independent lifecycle. |
| `ValueObject<T>` | Typed primitive with validation: `Email`, `Money`, `Slug`. |
| `DomainEvent`+`onEvent`+`EventCollector` | Aggregate emits on state change (`addEvent`); flushed to outbox automatically by `uow.run()`; handlers via `onEvent(type, factory)` auto-discovered by dispatcher. See `docs/EVENTS.md`. |
| `BaseRepository<T>` | Genuinely global aggregate (audit logs, system config). Rare. |
| `ScopedRepository<T, TScope>` | Owned aggregate carrying `userId`/`organizationId`. Default for any business table. |

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
- `uow.run()` cannot be nested (Drizzle nested TX = independent TX, not savepoints — events would leak orphan). `TransactionService.run()` throws if `EventCollector.hasContext()` is already true.
- Repos must call `trackEventsOnSuccess(result, aggregate)` (helper in `@packages/drizzle`) inside their `save`/`create` impl, otherwise events stay on the aggregate buffer and are silently lost.
- `addEvent()` outside `uow.run()` = events lost (warning logged in dev via `EventCollector.setOutOfContextLogger`).

**Subscribers built-in** to the dispatcher (no glue): `AuditEventSubscriber` (writes `audit_log` if event in `RETENTION_MAP`) + `WebhookFanoutSubscriber` (creates `webhook_delivery` rows for matching org-scoped endpoints).

**User-defined handlers** via `onEvent(type, factory)` + inwire binding — auto-discovered at boot via `EVENT_HANDLER_SYMBOL`:

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

BDD style. One test file per use case/service under `__TESTS__/` (services group `describe` per method). Mock at repository/port level. Test `Result`/`Option` state transitions.

**Substitute through the seam the code already has, before reaching for a module replacement.** A handler that takes its collaborators as arguments, a route factory that takes a `deps` object, a class that takes its repository in the constructor — pass a fake and the substitution is scoped by construction, typed against the real port, and visible in the test's first ten lines. Replacing the module is the fallback for the cases with no seam (a module-level singleton like `db`, a third-party SDK, a lib the code imports directly). **Why**: injection cannot reach past the object under test, so it cannot be the reason another test's verdict changed — and the day a collaborator gains a method, the compiler names every fake that must grow, which no module stand-in ever does. `github-key-verifier.test.ts` is the reference shape. The isolation rule in `../shared/CLAUDE.md` is what makes the fallback safe; it is not a reason to prefer it.

## Common patterns

```typescript
Result.ok(value); Result.fail(error); Result.combine([r1, r2, r3]);
Result.ok();                        // void payload only — Result<void, E>
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
const result = await di.UpdateNoteUseCase.execute({ id, body }, scope);
```
