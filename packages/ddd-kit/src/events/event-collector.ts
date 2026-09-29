import { AsyncLocalStorage } from "node:async_hooks";
import type { IDomainEvent } from "../domain/domain-event";

type CollectorContext = {
  events: IDomainEvent[];
};

const storage = new AsyncLocalStorage<CollectorContext>();

let outOfContextLogger: ((message: string, meta?: Record<string, unknown>) => void) | null = null;

export const EventCollector = {
  runWithContext<T>(callback: () => Promise<T>): Promise<T> {
    return storage.run({ events: [] }, callback);
  },

  add(events: IDomainEvent | IDomainEvent[]): void {
    const list = Array.isArray(events) ? events : [events];
    const ctx = storage.getStore();

    if (ctx) {
      ctx.events.push(...list);
      return;
    }

    if (list.length === 0) return;

    outOfContextLogger?.("EventCollector.add called outside runWithContext, events lost", {
      eventTypes: list.map((e) => e.eventType),
      aggregateIds: list.map((e) => e.aggregateId),
    });
  },

  drain(): IDomainEvent[] {
    const ctx = storage.getStore();
    if (!ctx) return [];

    const drained = ctx.events.slice();
    ctx.events.length = 0;
    return drained;
  },

  hasContext(): boolean {
    return storage.getStore() !== undefined;
  },

  setOutOfContextLogger(fn: typeof outOfContextLogger): void {
    outOfContextLogger = fn;
  },
};
