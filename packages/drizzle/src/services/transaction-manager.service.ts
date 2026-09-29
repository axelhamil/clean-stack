import { EventCollector, type IDomainEvent, type IUnitOfWork, Result } from "@packages/ddd-kit";
import { db, type Transaction } from "../config";

export type FlushHandler = (events: IDomainEvent[], tx: Transaction) => Promise<void>;

/**
 * The slice of the host's instrumentation port this service needs, declared here
 * because a package cannot import the app's port. Any `IInstrumentation` fits it.
 */
export interface UnitOfWorkInstrumentation {
  startSpan<T>(options: { name: string }, callback: () => Promise<T>): Promise<T>;
  capture(error: unknown): void;
}

/** Carries a failed `Result` out of `db.transaction` so the driver issues ROLLBACK. */
class FailedResultRollback extends Error {
  constructor(readonly result: unknown) {
    super("unit of work rolled back: the callback returned a failed Result");
  }
}

export class TransactionService implements IUnitOfWork<Transaction> {
  constructor(
    private readonly instrumentation: UnitOfWorkInstrumentation,
    private readonly flushHandler: FlushHandler | null = null,
  ) {}

  public async startTransaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: "TransactionService > startTransaction" },
      async () => {
        try {
          return await db.transaction(callback);
        } catch (err) {
          this.instrumentation.capture(err);
          throw err;
        }
      },
    );
  }

  /**
   * A callback that resolves to a failed `Result` rolls the whole transaction back
   * (its writes and the events it collected) and `run` resolves to that same
   * `Result`: a failure is all or nothing, callers never throw to undo a write.
   */
  public async run<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
    if (EventCollector.hasContext()) {
      throw new Error(
        "nested IUnitOfWork.run() is not supported: run() always opens from `db`, never from the parent tx, so a nested call takes a separate pool connection and commits independently. Threading the parent tx (a real Drizzle savepoint) would not fix it either: `rollback to savepoint` cannot un-collect the in-memory EventCollector buffer, so rolled-back writes would still emit events. Refactor to a single outer run().",
      );
    }

    return this.instrumentation.startSpan({ name: "TransactionService > run" }, async () => {
      try {
        return await db.transaction((tx) =>
          EventCollector.runWithContext(async () => {
            const result = await callback(tx);
            const events = EventCollector.drain();
            if (result instanceof Result && result.isFailure)
              throw new FailedResultRollback(result);

            if (events.length > 0 && this.flushHandler) await this.flushHandler(events, tx);

            return result;
          }),
        );
      } catch (err) {
        if (err instanceof FailedResultRollback) return err.result as T;

        this.instrumentation.capture(err);
        throw err;
      }
    });
  }
}
