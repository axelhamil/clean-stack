import { AsyncLocalStorage } from "node:async_hooks";
import type { DbClient, Transaction } from "@packages/drizzle";

const current = new AsyncLocalStorage<Transaction>();

/**
 * The database handle given to BetterAuth's adapter: `db` itself, except that every
 * transaction the adapter opens is published to the code that runs inside it.
 *
 * With native transactions on, BetterAuth and its plugins (SSO sign-in, SCIM
 * provisioning) create a user, its account and its session in one transaction and
 * call our database hooks from inside it. A hook that writes through `db` works on
 * another connection, which cannot see those uncommitted rows: a `member` insert for
 * the user being created fails its foreign key, a count misses the rows in flight,
 * and a delete can wait on a lock the adapter's own transaction holds. The adapter
 * keeps its Drizzle transaction private, so it is captured here instead, where the
 * adapter asks `db` to open it.
 */
export function withPublishedTransactions(db: DbClient): DbClient {
  return new Proxy(db, {
    get(target, property, receiver) {
      if (property !== "transaction") return Reflect.get(target, property, receiver);

      const transaction: DbClient["transaction"] = (callback, config) =>
        target.transaction((tx) => current.run(tx, () => callback(tx)), config);
      return transaction;
    },
  });
}

/** The BetterAuth transaction the caller runs inside, if any. */
export function currentAuthTransaction(): Transaction | undefined {
  return current.getStore();
}

/**
 * Runs `work` inside the BetterAuth transaction in flight, so it commits or rolls
 * back with the change that caused it, or in a transaction of its own when there is
 * none (a hook BetterAuth runs after its commit, or outside any transaction).
 */
export function inAuthTransaction<T>(
  db: DbClient,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const tx = current.getStore();
  if (tx) return work(tx);

  return db.transaction(work);
}
