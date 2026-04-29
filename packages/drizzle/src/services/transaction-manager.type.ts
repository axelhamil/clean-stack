import type { Transaction } from "../config";

export interface ITransactionManagerService {
  startTransaction<T>(callback: (trx: Transaction) => Promise<T>, parent?: Transaction): Promise<T>;
}
