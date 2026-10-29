import { UnitOfWorkContext } from "../application/unit-of-work-context";
import type { IEventSource } from "../domain/aggregate";
import type { IDomainEvent } from "../domain/domain-event";

let outOfContextLogger: ((message: string, meta?: Record<string, unknown>) => void) | null = null;

export const EventCollector = {
  runWithContext<T>(callback: () => Promise<T>): Promise<T> {
    return UnitOfWorkContext.run(undefined, callback);
  },

  add(events: IDomainEvent | IDomainEvent[]): void {
    const list = Array.isArray(events) ? events : [events];
    const ctx = UnitOfWorkContext.current();

    if (ctx) {
      ctx.events.push(...list);
      return;
    }

    if (list.length === 0) return;

    outOfContextLogger?.("EventCollector.add called outside a unit of work, events lost", {
      eventTypes: list.map((e) => e.eventType),
      aggregateIds: list.map((e) => e.aggregateId),
    });
  },

  collectFrom(saved: IEventSource | readonly IEventSource[]): void {
    const sources: readonly IEventSource[] = Array.isArray(saved) ? saved : [saved];
    const events = sources.flatMap((source) => source.pullDomainEvents());
    if (events.length === 0) return;

    EventCollector.add(events);
  },

  drain(): IDomainEvent[] {
    const ctx = UnitOfWorkContext.current();
    if (!ctx) return [];

    const drained = ctx.events.slice();
    ctx.events.length = 0;
    return drained;
  },

  hasContext(): boolean {
    return UnitOfWorkContext.current() !== undefined;
  },

  setOutOfContextLogger(fn: typeof outOfContextLogger): void {
    outOfContextLogger = fn;
  },
};
