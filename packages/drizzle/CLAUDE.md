# drizzle rules

The database package: Drizzle client, schema, migrations and the transaction service. Auto-loaded under `packages/drizzle/`. Consumers: `apps/api` (stores, repositories, `auth-queries.ts`). Cross-cutting rules: `/CLAUDE.md`; server usage: `apps/api/CLAUDE.md`.

## Layout

```
drizzle.config.ts              drizzle-kit config (schema "./src/schema/*", out "./migrations")
migrations/                    generated SQL, committed
src/
  config.ts                    `db`, `DbClient`, `Transaction`
  schema/<topic>.ts            one file per topic (auth, multi-tenant, outbox, audit-log, webhooks, billing, ...), re-exported as `<topic>Schema` from `index.ts`
  repositories/track-events.ts `trackEventsOnSuccess`
  services/                    `TransactionService` (the `IUnitOfWork` impl)
  seeds/                       dev seeds
  rate-limit-client.ts         dedicated pool for the rate-limiter store
```

## Rules

1. **The package is the only importer of `drizzle-orm`.** Query helpers (`and`, `eq`, `inArray`, `isNull`, `arrayContains`, `sql`, ...) are re-exported from `index.ts`; a consumer imports them from `@packages/drizzle`. A missing helper is added to the re-export list, never imported from `drizzle-orm` in an app. **Why**: one place to swap or pin the ORM, and the workspace boundary stays checkable.
2. **Typed builder first, raw SQL last.** `select`/`insert`/`update`/`delete` and the helpers cover filters, array operators and row locks (`.for("update", { skipLocked: true })`). A `sql` fragment is acceptable only for DDL, session-scoped tuning (`SET LOCAL ...`) or an operator with no helper (search the exports first), and keeps its columns typed (`${table.col}`). **Why**: the typed builder catches rename and type drift at compile time; raw SQL rots until a runtime exception.
3. **Every business table owns `organizationId NOT NULL` + FK `organization(id) ON DELETE CASCADE` from its first migration.** **Why**: retrofitting multi-tenancy is the most expensive refactor class, and a missing cascade leaves orphans after an org deletion. The audit log and the outbox are the exception: their `organization_id` is a plain column so the trail outlives the org.
4. **A schema change ships with its migration**: `db:push` is dev only, anything reaching `main` goes through `db:generate` + `db:migrate`. Touch an existing schema as little as possible.

## Unit of work

`TransactionService implements IUnitOfWork<Transaction>`; the API pins `TTx = ITransaction` (alias in `apps/api/src/shared/transaction.ts`). It takes a minimal instrumentation slice (`UnitOfWorkInstrumentation`) because a package cannot import the app's port; any `IInstrumentation` fits.

- `run(cb)` opens an `EventCollector` context, runs `cb(tx)`, drains the collected events and hands them to the `FlushHandler` (the outbox) before commit, so the writes and their events are atomic.
- `run()` cannot be nested: it always opens from `db`, and `EventCollector.hasContext()` makes a nested call throw. **Why**: a nested call takes a separate pool connection and commits independently, and a savepoint would not fix it since `rollback to savepoint` cannot un-collect the in-memory event buffer.
- A callback that resolves to a failed `Result` rolls everything back (writes and events) and `run()` resolves to that `Result`; return the failure, never throw a sentinel. Proven against Postgres by `check:uow-rollback` (`apps/api`).
- A repository's `save`/`create` calls `trackEventsOnSuccess(result, aggregate)`, otherwise the events stay on the aggregate and are silently lost.
- `run()` does not capture errors: it rethrows to a caller that knows whether the throw is expected, and the central error handler reports the unexpected ones. Capturing here would double-report every 5xx.

## Commands

`pnpm db:push` · `db:generate` · `db:migrate` · `db:seed` · `db:studio` (root scripts, run through Turbo; `.env` comes from `pnpm bootstrap`) · `pnpm --filter @packages/drizzle type-check`.
