import { AsyncLocalStorage } from "node:async_hooks";
import type { IDomainEvent } from "../domain/domain-event";

export interface UnitOfWorkScope {
  tx: unknown;
  events: IDomainEvent[];
  closed: boolean;
}

const storage = new AsyncLocalStorage<UnitOfWorkScope>();

export const UnitOfWorkContext = {
  async run<T>(tx: unknown, work: () => Promise<T>): Promise<T> {
    const scope: UnitOfWorkScope = { tx, events: [], closed: false };

    try {
      return await storage.run(scope, work);
    } finally {
      scope.closed = true;
    }
  },

  current(): UnitOfWorkScope | undefined {
    const scope = storage.getStore();
    if (!scope || scope.closed) return undefined;

    return scope;
  },

  transaction<TTx>(): TTx | undefined {
    return UnitOfWorkContext.current()?.tx as TTx | undefined;
  },
};
