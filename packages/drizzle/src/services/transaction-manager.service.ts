import type { IUnitOfWork } from "@packages/ddd-kit";
import { db, type Transaction } from "../config";

export class TransactionService implements IUnitOfWork<Transaction> {
  public async startTransaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T> {
    return db.transaction(callback);
  }
}
