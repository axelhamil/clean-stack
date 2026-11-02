/**
 * Unit of work. `run(work)` opens a transaction, or joins the one already open in the
 * ambient scope (`UnitOfWorkContext`), and flushes the events collected through
 * `EventCollector` before the outermost run commits. A failed `Result` returned at any
 * depth rolls the whole unit back and the outermost `run` resolves to that `Result`.
 * Stores read the open transaction from the ambient scope, `work` receives nothing.
 */
export interface IUnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
}
