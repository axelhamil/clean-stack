// Atomic Repository / Unit of Work pattern. The controller (or application
// service) calls `startTransaction(async (tx) => ...)`; the callback receives a
// provider-typed `TTx` it threads to every repo / use case running inside.
// `TTx` is parametric — the project pins it (e.g. `IUnitOfWork<ITransaction>`
// where `ITransaction` is a type alias to the provider's concrete tx type).
export interface IUnitOfWork<TTx = unknown> {
  startTransaction<T>(callback: (tx: TTx) => Promise<T>): Promise<T>;
}
