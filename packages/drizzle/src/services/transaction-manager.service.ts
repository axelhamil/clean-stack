import { EventCollector, type IDomainEvent, type IUnitOfWork } from "@packages/ddd-kit";
import { db, type Transaction } from "../config";

export type FlushHandler = (events: IDomainEvent[], tx: Transaction) => Promise<void>;

export class TransactionService implements IUnitOfWork<Transaction> {
  constructor(private readonly flushHandler: FlushHandler | null = null) {}

  public async startTransaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
    return db.transaction(callback);
  }

  public async run<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
    if (EventCollector.hasContext()) {
      throw new Error(
        "nested IUnitOfWork.run() is not supported — run() always opens from `db`, never from the parent tx, so a nested call takes a separate pool connection and commits independently. Threading the parent tx (a real Drizzle savepoint) would not fix it either: `rollback to savepoint` cannot un-collect the in-memory EventCollector buffer, so rolled-back writes would still emit events. Refactor to a single outer run().",
      );
    }
    return db.transaction((tx) =>
      EventCollector.runWithContext(async () => {
        const result = await callback(tx);
        const events = EventCollector.drain();
        if (events.length > 0 && this.flushHandler) {
          await this.flushHandler(events, tx);
        }
        return result;
      }),
    );
  }
}
