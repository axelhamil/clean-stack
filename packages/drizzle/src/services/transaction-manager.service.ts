import { db, type Transaction } from "../config";
import type { ITransactionManagerService } from "./transaction-manager.type";

export class TransactionService implements ITransactionManagerService {
  public async startTransaction<T>(
    callback: (trx: Transaction) => Promise<T>,
    parent?: Transaction,
  ): Promise<T> {
    const invoker = parent ?? db;
    return invoker.transaction(async (trx) => callback(trx));
  }
}
