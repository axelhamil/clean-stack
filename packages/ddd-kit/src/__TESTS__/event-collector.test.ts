import { describe, expect, it } from "vitest";
import {
  Aggregate,
  EVENT_HANDLER_SYMBOL,
  EventCollector,
  type IDomainEvent,
  isEventHandler,
  onEvent,
  UnitOfWorkContext,
  UUID,
} from "../index";

const inScope = <T>(work: () => Promise<T>): Promise<T> => UnitOfWorkContext.run(undefined, work);

class TestEvent implements IDomainEvent<{ value: number }> {
  readonly eventType = "test.event";
  readonly dateOccurred = new Date();
  readonly aggregateId: string;
  readonly payload: { value: number };

  constructor(aggregateId: string, value: number) {
    this.aggregateId = aggregateId;
    this.payload = { value };
  }
}

class CounterAggregate extends Aggregate<{ count: number }> {
  static create(): CounterAggregate {
    return new CounterAggregate({ count: 0 }, new UUID());
  }

  increment(): void {
    this._props.count += 1;
    this.addEvent(new TestEvent(this._id.value.toString(), this._props.count));
  }
}

describe("EventCollector (ALS)", () => {
  it("returns empty array when drained outside context", () => {
    expect(EventCollector.drain()).toEqual([]);
    expect(EventCollector.hasContext()).toBe(false);
  });

  it("collects events added inside context and drains them once", async () => {
    const result = await inScope(async () => {
      EventCollector.add(new TestEvent("agg-1", 1));
      EventCollector.add([new TestEvent("agg-1", 2), new TestEvent("agg-1", 3)]);
      const drained = EventCollector.drain();
      const drainedAgain = EventCollector.drain();
      return { drained, drainedAgain };
    });

    expect(result.drained).toHaveLength(3);
    expect(result.drainedAgain).toHaveLength(0);
  });

  it("isolates events between concurrent contexts", async () => {
    const ctxA = inScope(async () => {
      EventCollector.add(new TestEvent("agg-A", 1));
      await new Promise((r) => setTimeout(r, 10));
      EventCollector.add(new TestEvent("agg-A", 2));
      return EventCollector.drain();
    });

    const ctxB = inScope(async () => {
      EventCollector.add(new TestEvent("agg-B", 1));
      return EventCollector.drain();
    });

    const [eventsA, eventsB] = await Promise.all([ctxA, ctxB]);

    expect(eventsA).toHaveLength(2);
    expect(eventsA.every((e) => e.aggregateId === "agg-A")).toBe(true);
    expect(eventsB).toHaveLength(1);
    expect(eventsB[0]?.aggregateId).toBe("agg-B");
  });

  it("reports events added outside a context instead of collecting them", () => {
    const reports: Array<Record<string, unknown> | undefined> = [];
    EventCollector.setOutOfContextLogger((_message, meta) => reports.push(meta));

    EventCollector.add([]);
    EventCollector.add(new TestEvent("agg-1", 1));
    EventCollector.setOutOfContextLogger(null);

    expect(reports).toEqual([{ eventTypes: ["test.event"], aggregateIds: ["agg-1"] }]);
    expect(EventCollector.drain()).toEqual([]);
  });

  it("given saved aggregates, when collected, then collectFrom pulls the events of one aggregate and of a list", async () => {
    const one = CounterAggregate.create();
    one.increment();
    const other = CounterAggregate.create();
    other.increment();
    other.increment();
    const untouched = CounterAggregate.create();

    const collected = await inScope(async () => {
      EventCollector.collectFrom(one);
      EventCollector.collectFrom([one, other, untouched]);

      return EventCollector.drain();
    });

    expect(collected.map((event) => event.payload)).toEqual([
      { value: 1 },
      { value: 1 },
      { value: 2 },
    ]);
    expect(other.hasEvents()).toBe(false);
  });

  it("given a promise that outlives its scope, when it adds events after the scope closed, then they are reported as lost", async () => {
    const reports: Array<Record<string, unknown> | undefined> = [];
    EventCollector.setOutOfContextLogger((_message, meta) => reports.push(meta));

    const late = await inScope(async () => ({
      added: new Promise<boolean>((resolve) =>
        setTimeout(() => {
          EventCollector.add(new TestEvent("agg-late", 1));
          resolve(EventCollector.hasContext());
        }, 10),
      ),
    }));
    const contextSeenLate = await late.added;
    EventCollector.setOutOfContextLogger(null);

    expect(contextSeenLate).toBe(false);
    expect(reports).toEqual([{ eventTypes: ["test.event"], aggregateIds: ["agg-late"] }]);
  });

  it("does not leak events outside the context after it closes", async () => {
    await inScope(async () => {
      EventCollector.add(new TestEvent("agg-1", 1));
    });

    expect(EventCollector.drain()).toEqual([]);
    expect(EventCollector.hasContext()).toBe(false);
  });
});

describe("Aggregate.pullDomainEvents()", () => {
  it("returns events and clears them atomically", () => {
    const counter = CounterAggregate.create();
    counter.increment();
    counter.increment();
    counter.increment();

    const drained = counter.pullDomainEvents();

    expect(drained).toHaveLength(3);
    expect(counter.hasEvents()).toBe(false);
    expect(counter.pullDomainEvents()).toEqual([]);
  });

  it("returns a defensive copy unaffected by subsequent addEvent", () => {
    const counter = CounterAggregate.create();
    counter.increment();

    const drained = counter.pullDomainEvents();
    counter.increment();

    expect(drained).toHaveLength(1);
    expect(counter.pullDomainEvents()).toHaveLength(1);
  });
});

describe("onEvent / EventHandler", () => {
  it("creates a handler tagged with the marker symbol", () => {
    const handler = onEvent("user.created", (deps: { calls: string[] }) => async (event) => {
      deps.calls.push(event.eventType);
    })({ calls: [] });

    expect(handler[EVENT_HANDLER_SYMBOL]).toBe(true);
    expect(handler.eventType).toBe("user.created");
    expect(typeof handler.handle).toBe("function");
  });

  it("isEventHandler discriminates handlers from arbitrary objects", () => {
    const handler = onEvent("x.y", () => async () => {})({});
    expect(isEventHandler(handler)).toBe(true);
    expect(isEventHandler({})).toBe(false);
    expect(isEventHandler(null)).toBe(false);
    expect(isEventHandler({ eventType: "x.y", handle: () => {} })).toBe(false);
  });

  it("handle invokes the factory output", async () => {
    const calls: string[] = [];
    const handler = onEvent("user.created", (deps: { log: string[] }) => async (event) => {
      deps.log.push(`got ${event.eventType}`);
    })({ log: calls });

    await handler.handle(new TestEvent("agg-1", 1));
    expect(calls).toEqual(["got test.event"]);
  });
});
