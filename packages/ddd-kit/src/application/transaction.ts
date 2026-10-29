/**
 * Unit of work. `run(work)` opens a transaction, or joins the one already open in the
 * ambient scope (`UnitOfWorkContext`), and flushes the events collected through
 * `EventCollector` before the outermost run commits. A failed `Result` returned at any
 * depth rolls the whole unit back and the outermost `run` resolves to that `Result`.
 * `startTransaction` opens a plain transaction that flushes nothing.
 * `TTx` is the provider's transaction type, still handed to `work` while callers migrate
 * to reading the ambient executor.
 */
export interface IUnitOfWork<TTx = unknown> {
  startTransaction<T>(callback: (tx: TTx) => Promise<T>): Promise<T>;
  run<T>(work: (tx: TTx) => Promise<T>): Promise<T>;
}
