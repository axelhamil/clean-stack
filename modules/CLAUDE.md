# Module rules

`modules/<name>` holds one business module, published in the workspace as `@modules/<name>`. Auto-loaded for every file under `modules/`. Cross-cutting rules: `/CLAUDE.md`. The host side of this contract (composition, route guards, container) is `apps/api/CLAUDE.md`; the generic test rules are `packages/test/CLAUDE.md`.

## Anatomy

```
modules/<name>/
  package.json        exports per layer pointing at src/ and schemas/, no build
  tsconfig.json       noEmit
  bunfig.toml         preload from @packages/test, only when a test needs one
  schemas/            the tables this module owns
  scripts/            check-*.ts against a real database, about this module only, on the generic harness of @packages/test; a module has no .env, DATABASE_URL comes from the shell
  src/
    <name>.module.ts  defineModule<<Name>Prerequisites>()
    domain/  application/{config,ports,services,use-cases,dto,event-handlers}  infrastructure/{repositories,services,http,...}
    testing/          fixtures other tests may import
    __TESTS__/        every test, layering.test.ts included
```

`<name>/CLAUDE.md` exists only for rules no other guide or skill holds (invariants, events emitted, ports exposed, traps).

## Contract

1. **The module exports factories, the host composes them.** `<name>.module.ts` (`defineModule`), `create<Name>Routes(deps)`, `create<Name>InternalRoutes(deps)`, plus what the host must bind (application services, event handlers) and every port or service type the host container's inferred type names (its declaration emit needs a public specifier for each, else `TS2883` in `container.ts`). Only an app imports `*.module.ts`. **Why**: a second importer would inherit the module's prerequisites and could wire it twice.
2. **Everything from outside arrives in `<Name>Prerequisites`**: `ddd-kit` ports, the ports the module declares, its typed settings. Never `env`, never the built container, never the auth instance. **Why**: a package that reads ambient state cannot be type-checked or tested alone, and swapping a provider would touch its code.
3. **A need towards another module is a port the consumer declares**, served by an application service of the provider and bound by the host. Never an import of the other module. **Why**: the dependency stays visible in one host file and either side can be removed without touching the other.
4. **Events go through the one catalog in `packages/events`**, emitted in the same unit of work as the write. A handler reacting to another module's event lives in the reacting module and subscribes by event type, never by importing the emitter.
5. **A read joining tables of two modules lives in the host** (`apps/api/src/queries/`) behind a port the module declares. **Why**: a module reading another module's tables couples their schemas without any visible dependency. The tables the auth library or the infrastructure own (auth, multi-tenant, SSO, outbox, email, sweep, rate limit, all in `packages/drizzle`) are kit, not another module's: a module reads them directly, and writes them only for an erasure it owns (rgpd anonymises the user and deletes their sessions, memberships and personal organization). **Why**: they belong to no business module, so a port in front of each would add dozens of interfaces and decouple nothing, while any other write stays with the library or the kit that owns the table's lifecycle.
6. **Routes receive their guards** (`RouteGuards`) and their services through `deps`. A route may read its own tables; it writes only through a service or a use case.
7. **Relative imports inside the module, no `@/` alias, no barrel.** Other modules and apps reach it only through the `exports` of its `package.json`.
8. **Source only**: `exports` point at `src/` and `schemas/`, no build script, no `dist/` (root rule 4).

## Folders

What each folder of the Anatomy tree holds; a folder with nothing to hold does not exist. The `infrastructure/` list is open: a folder named after its concern (`adapters/` in billing) is fine.

- `domain/`: only aggregates and other `ddd-kit` primitives, never anemic data records, which live with their port. A pure rule with no aggregate is a policy service in `application/services/` (`billing/src/application/services/entitlement-policy.service.ts`, `quotas/src/application/services/quota-policy.service.ts`). An empty `domain/` is cargo-cult.
- `application/config/`: the module's typed settings, which the host fills from the env (contract 2).
- `application/ports/`: interfaces the module consumes, their failure shape and their data records.
- `application/use-cases/`: one file per use case, only where an aggregate exists (Layers).
- `application/services/`: `<Noun>Service` with N methods. A method may call `this.<other>`; a service never injects another service.
- `application/dto/`: request schemas, `<verb-noun>.dto.ts` with `<Noun>Input = z.infer<...>`.
- `application/event-handlers/`: `onEvent` handlers (Domain events).
- `infrastructure/repositories/`: `*.store.ts` (`I<Noun>Store`) for persistence without an aggregate (projections, settings, read models), `*.repository.ts` only where the port models an owned record with a lifecycle. Row mapping stays inside the store; a `mappers/` folder exists only next to an aggregate.
- `infrastructure/services/`, `adapters/`: implementations of the module's ports towards an outside service.
- `infrastructure/http/`: the route factories of contract 1; an internal routes file states its gate in a header comment.

**Why**: the path tells which layer rules apply before the file is opened, and the `store` or `repository` suffix tells whether an aggregate's invariants are at stake.

## Layers

Orchestration defaults to `application/services/`; add `domain/` and `use-cases/` only when the test below says an aggregate exists. Billing gates, seat checks and quota gating are config + middleware + hook, never use cases: billing, auth, plans and quotas are never DDD (the `domain/` files above are pure rules, not aggregates).

**Do I need an aggregate?** The rule fits in `array.includes()`, `count(*)` or a config lookup → infra orchestration, stay flat. An entity has an invariant only it can enforce (`<Aggregate>.canCancel()` checks several props) → aggregate. SQL counts are not invariants. Primitive semantics (`Result`, `Option`, `ValueObject`, ...): `packages/ddd-kit/CLAUDE.md`.

**Domain and application import no framework, no database driver, no provider SDK and no infrastructure.** `check:boundaries` refuses, from `domain/` and `application/`, the module's own `infrastructure/` and `schemas/`, `@packages/drizzle` and the frameworks and SDKs (Hono, Drizzle, pg, BetterAuth, AWS SDK, Resend, Stripe, Sentry). Kit ports and helpers are fine (`@packages/outbox` emit and port, `@packages/http` cursor and sweep port, `@packages/email` port, `@packages/i18n`, ...), and so is `zod`; provider concrete types never appear (`PgTransaction`, `SessionUser`, `S3Client`, ...). **Why**: application says *what*, not *how*; a use case importing a provider type survives a swap only by accident, which is exactly what ports exist to prevent. Cross-aggregate references use the typed id of the referenced module (`<name>-id.ts`, see `packages/ddd-kit/CLAUDE.md`), never `SessionUser["id"]` or `string`.

## Ports

1. **A port is declared by the module that consumes it**, in `application/ports/`. Its implementation is in the same module (`infrastructure/`), or the host binds it to what another module or the host provides (contract 3). **Why**: who consumes the port decides where it lives, never where the implementation lives; a port next to its consumer is removed with it, and an asymmetry between port and implementation is the price of no coupling between modules.
2. **Two modules that need the same shape each declare their own port**, and the host binds both to one implementation: `admin` and `rgpd` each declare `ITotpVerifier`. A shared copy is promoted to a kit package only at the 2nd occurrence of the *implementation* (root rule 2). Kit ports (`IInstrumentation`, `ILogger`, `IUnitOfWork`, outbox, email) come from packages and arrive through `<Name>Prerequisites`.
3. **Not a module**: a context with only an infra adapter (no domain, use case, DTO or routes) is host platform code. Test: removing the "module" leaves only its module file plus one port implementation.

Absence in a port signature: `packages/ddd-kit/CLAUDE.md`, rule 2.

## Commands and queries

- **Commands** (writes): Controller → Use Case or Service → Aggregate or Store → EventDispatcher → Handlers
- **Queries** (reads): Controller → Query (direct ORM, no use case)

## Dependency injection

```ts
// modules/<x>/src/<x>.module.ts
export interface FooPrerequisites { IInstrumentation: IInstrumentation; IBarLookup: IBarLookup; fooSettings: FooSettings; }
export const fooModule = defineModule<FooPrerequisites>()((b) =>
  b.add("IFooStore", (c): IFooStore => new DrizzleFooStore(c.IInstrumentation))
   .add("FooService", (c) => new FooService(c.IFooStore, c.IBarLookup, c.fooSettings)),
);
```

1. **`defineModule<<Name>Prerequisites>()` with its explicit generic, never the global `AppDeps` augmentation.** **Why**: a module typed against `AppDeps` sees every key of every other module, so its real dependencies are invisible and it cannot be type-checked outside the app that augments it, which a module living in its own package must be. Only the host's composition root augments `AppDeps`.
2. **All deps via DI**; never `new` a collaborator outside the container (it bypasses the container and breaks per-test impl swaps). No service locators: a route reads `deps`, a test passes a plain `deps` object (`openRouteGuards()` from `@packages/http/testing/route-guards`).
3. **Transactions are opened by `uow.run` in use cases, services and route handlers; repositories read the ambient executor.** A route opens `ITransactionService.run(...)` from its `deps` only when it composes several store writes itself. No port, store or service declares a transaction parameter, and only `packages/drizzle` and scripts open a transaction directly; each module's `layering.test.ts` enforces both (Boundaries). **Why**: a handle threaded by hand is forgotten at one call site, and that write silently commits outside the unit it belongs to.

## Repositories and instrumentation

Root rule 8 applied to a store, a repository or an outside call: the outer span is named `ClassName > methodName`, the inner span is named by the SQL (`query.toSQL().sql`, `op: "db.query"`) or `op: "http.client"`, and `const exec = resolveExecutor()` is read outside the `startSpan` callback, never passed as a `tx`. Full pattern with an example: [`docs/OBSERVABILITY.md`](../docs/OBSERVABILITY.md).

## Domain events

Declaration and payload contract: `packages/events/CLAUDE.md`. Relay, lease and handler contract: `packages/outbox/CLAUDE.md`. Unit of work semantics (nesting, rollback, flush, `collectFrom`): `packages/drizzle/CLAUDE.md` and `packages/ddd-kit/CLAUDE.md`. What a module author decides:

- **With an aggregate**, the method calls `this.addEvent(...)` and the use case writes zero dispatch code: it runs `uow.run(() => repo.save(aggregate))`, and the repository hands the events over once its write succeeded.
- **Without an aggregate**, the write and its `emitEvent(outbox, ...)` share one `uow.run(async () => ...)`; neither the store nor the outbox takes a `tx`, both read the ambient executor. **Test it** with `mockUnitOfWork` and record `UnitOfWorkContext.transaction()` inside the store and `enqueue` mocks (a test-only read; app code goes through `ambientTransaction()`), then assert both saw the same one: a call count passes even when both writes run outside the transaction. `enqueuedEvents(outbox)` (`@packages/outbox/testing/enqueued-events`) reads what a mocked outbox received.
- **A handler** lives in the module that reacts (contract 4), as `onEvent(type, handlerName, factory, { payload })` bound in the module file. Its parser is `payloadParser(PayloadByEventType[type])` (`@packages/outbox/payload-parser`) declared as a module constant, since built inline its type is not inferred into the body:

```ts
const parsePayload = payloadParser(PayloadByEventType[EventTypes.ORG_MEMBER_REMOVED]);

export const revokeOnMembershipLost = onEvent(
  EventTypes.ORG_MEMBER_REMOVED,
  "revoke-api-tokens-on-membership-lost",
  (c: Deps) => dispatchTo(c.RevokeMembershipTokensUseCase, ({ userId, organizationId, actorUserId }) => ({ userId, organizationId, actorUserId })),
  { payload: parsePayload },
);
```

- **A built-in subscriber** (`audit-log`, `webhooks`, `notifications`) lives in and is registered by the module that reacts; the host hands it to `buildEventDispatcher`, which subscribes it to every catalog type, so a type with no handler cannot exist. Each runs its own short `uow.run` and writes with a key derived from `eventId` and `ON CONFLICT DO NOTHING`, so a redelivery writes nothing twice.

## Testing

Generic rules: `packages/test/CLAUDE.md`. A module's real-database check (its rule 5) is a `check:*` script of the module's `package.json`, run in CI as `pnpm --filter @modules/<name> check:<x>`.

## Boundaries

`pnpm check:boundaries` scans `apps packages modules` with `.dependency-cruiser.cjs`: no cross-module import (tests may reach another module's `schemas/` only, schemas reach only other schemas), only apps import `*.module.ts`, `packages/` never reaches a module or an app, a module never imports an app, the fronts never import a module, `domain/` and `application/` stay free of infrastructure, schemas, database and frameworks, host queries read modules through `schemas/` and `application/ports/` only, no runtime cycle. Each module adds `src/__TESTS__/layering.test.ts` calling `assertModuleLayering` from `@packages/test/source-scan` for what imports cannot express (no throw in domain or application, no write from a routes file, no transaction parameter or opener, no env read, no reach into the host).

## Moving a module here

A move keeps the HTTP contract: `pnpm check:api-shape` compares the `AppType` declaration with its frozen copy in `apps/api/shape/` regardless of union and member order and of local import paths, and the `METHOD path` inventory line for line. A drift on a move is a changed contract until proven otherwise. The one accepted drift is the text of a type alias whose declaring package changed (`import("@packages/a").X` becoming `import("@packages/b").X`): prove the frozen copy, with only those specifiers rewritten, canonically equal to the emitted declaration, then refreeze with `pnpm api-shape:update` in the same commit and say so in the PR. Any other drift is fixed in the code, never refrozen. **Why**: the frozen copy is what the typed client was built against, so a refreeze that is not proven structural silently ships a contract change under a refactor; never edit the copy by hand, the tool is the only writer.
