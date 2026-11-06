import { describe, expect, it } from "vitest";
import { Aggregate, BaseDomainEvent, UUID } from "../index";

class CounterIncremented extends BaseDomainEvent<{ count: number }> {
  readonly eventType = "counter.incremented";

  constructor(
    readonly aggregateId: string,
    readonly payload: { count: number },
  ) {
    super();
  }
}

class Counter extends Aggregate<{ count: number }> {
  static create(): Counter {
    return new Counter({ count: 0 }, new UUID("counter-1"));
  }

  increment(): void {
    this._props.count += 1;
    this.addEvent(new CounterIncremented(String(this._id.value), { count: this._props.count }));
  }
}

describe("Aggregate", () => {
  it("clones with the same id and the merged props, leaving its pending events on the original", () => {
    const counter = Counter.create();
    counter.increment();

    const reset = counter.clone({ count: 0 });

    expect(reset).toBeInstanceOf(Counter);
    expect(reset.id.equals(counter.id)).toBe(true);
    expect(reset.get("count")).toBe(0);
    expect(reset.getDomainEvents()).toEqual([]);
    expect(counter.get("count")).toBe(1);
    expect(counter.getDomainEvents()).toHaveLength(1);
  });

  it("hands over its events once, in the order they happened", () => {
    const counter = Counter.create();
    counter.increment();
    counter.increment();

    const pulled = counter.pullDomainEvents();

    expect(
      pulled.map(({ eventType, aggregateId, payload }) => ({ eventType, aggregateId, payload })),
    ).toEqual([
      { eventType: "counter.incremented", aggregateId: "counter-1", payload: { count: 1 } },
      { eventType: "counter.incremented", aggregateId: "counter-1", payload: { count: 2 } },
    ]);
    expect(counter.pullDomainEvents()).toEqual([]);
  });

  it("keeps the events that happen after a pull for the next one", () => {
    const counter = Counter.create();
    counter.increment();
    const pulled = counter.pullDomainEvents();

    counter.increment();

    expect(pulled).toHaveLength(1);
    expect(counter.pullDomainEvents().map((event) => event.payload)).toEqual([{ count: 2 }]);
  });
});
