import { match, Result } from "@packages/ddd-kit";
import { ambientTransaction, type DbClient, type Transaction } from "@packages/drizzle";

export interface OutermostUnitOfWork {
  runOutermost<T>(work: () => Promise<T>): Promise<T>;
}

class UnitOfWorkRolledBack extends Error {
  constructor(readonly failure: unknown) {
    super(
      `a BetterAuth transaction was rolled back by a failed unit of work: ${JSON.stringify(failure)}`,
    );
  }
}

function openedTransaction(): Transaction {
  return match(ambientTransaction(), {
    Some: (tx) => tx,
    None: () => {
      throw new Error("a BetterAuth transaction ran outside its unit of work");
    },
  });
}

export function asUnitOfWork(client: DbClient, uow: () => OutermostUnitOfWork): DbClient {
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property !== "transaction") return Reflect.get(target, property, receiver);

      const transaction: DbClient["transaction"] = async (work) => {
        const outcome = await uow().runOutermost(() => work(openedTransaction()));
        if (outcome instanceof Result && outcome.isFailure) {
          throw new UnitOfWorkRolledBack(outcome.getError());
        }

        return outcome;
      };
      return transaction;
    },
  });
}
