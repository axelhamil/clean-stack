// Atomic Repository / Unit of Work pattern. The controller (or application
// service) calls `startTransaction(async (tx) => ...)` for a plain transaction,
// or `run(async (tx) => ...)` for a transaction that also flushes domain events
// captured via `EventCollector` (e.g. into an outbox) before commit.
// `TTx` is parametric — the project pins it (e.g. `IUnitOfWork<ITransaction>`
// where `ITransaction` is a type alias to the provider's concrete tx type).
export interface IUnitOfWork<TTx = unknown> {
  startTransaction<T>(callback: (tx: TTx) => Promise<T>): Promise<T>;
  run<T>(callback: (tx: TTx) => Promise<T>): Promise<T>;
}
