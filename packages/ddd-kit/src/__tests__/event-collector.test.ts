import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EventCollector,
  type IDomainEvent,
  type OutOfContextLogger,
  UnitOfWorkContext,
} from "../index";

const eventOf = (aggregateId: string): IDomainEvent => ({
  eventType: "clip.rendered",
  dateOccurred: new Date("2026-10-05T10:00:00Z"),
  aggregateId,
  payload: {},
});

const inScope = <T>(work: () => Promise<T>): Promise<T> => UnitOfWorkContext.run(undefined, work);

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("EventCollector", () => {
  afterEach(() => EventCollector.setOutOfContextLogger(null));

  it("collects the events of a unit of work and hands them over once", async () => {
    const { drained, drainedAgain } = await inScope(async () => {
      EventCollector.add(eventOf("clip-1"));
      EventCollector.add([eventOf("clip-2"), eventOf("clip-3")]);

      return { drained: EventCollector.drain(), drainedAgain: EventCollector.drain() };
    });

    expect(drained.map((event) => event.aggregateId)).toEqual(["clip-1", "clip-2", "clip-3"]);
    expect(drainedAgain).toEqual([]);
  });

  it("keeps the events of concurrent units of work apart", async () => {
    const slow = inScope(async () => {
      EventCollector.add(eventOf("slow-1"));
      await pause(10);
      EventCollector.add(eventOf("slow-2"));

      return EventCollector.drain();
    });
    const fast = inScope(async () => {
      EventCollector.add(eventOf("fast-1"));

      return EventCollector.drain();
    });

    const [slowEvents, fastEvents] = await Promise.all([slow, fast]);

    expect(slowEvents.map((event) => event.aggregateId)).toEqual(["slow-1", "slow-2"]);
    expect(fastEvents.map((event) => event.aggregateId)).toEqual(["fast-1"]);
  });

  it("leaves nothing behind once the unit of work is over", async () => {
    await inScope(async () => {
      EventCollector.add(eventOf("clip-1"));
    });

    expect(EventCollector.hasContext()).toBe(false);
    expect(EventCollector.drain()).toEqual([]);
  });

  it("reports an event added outside a unit of work instead of losing it silently", () => {
    const report = vi.fn<OutOfContextLogger>();
    EventCollector.setOutOfContextLogger(report);

    EventCollector.add([]);
    EventCollector.add(eventOf("clip-1"));

    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.lastCall?.[1]).toEqual({
      eventTypes: ["clip.rendered"],
      aggregateIds: ["clip-1"],
    });
    expect(EventCollector.drain()).toEqual([]);
  });

  it("reports an event added by a promise that outlived its unit of work", async () => {
    const report = vi.fn<OutOfContextLogger>();
    EventCollector.setOutOfContextLogger(report);

    const { late } = await inScope(async () => ({
      late: pause(10).then(() => EventCollector.add(eventOf("clip-late"))),
    }));
    await late;

    expect(report.mock.lastCall?.[1]).toEqual({
      eventTypes: ["clip.rendered"],
      aggregateIds: ["clip-late"],
    });
  });

  it("keeps the logger of another host when a first host releases its own", () => {
    const first = vi.fn<OutOfContextLogger>();
    const second = vi.fn<OutOfContextLogger>();
    EventCollector.setOutOfContextLogger(first);
    EventCollector.setOutOfContextLogger(second);

    EventCollector.releaseOutOfContextLogger(first);
    EventCollector.add(eventOf("clip-1"));
    EventCollector.releaseOutOfContextLogger(second);
    EventCollector.add(eventOf("clip-2"));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("collects the events of a saved aggregate once, however often it is saved", async () => {
    const report = vi.fn<OutOfContextLogger>();
    EventCollector.setOutOfContextLogger(report);
    const pending = [eventOf("clip-1"), eventOf("clip-1")];
    const clip = { pullDomainEvents: () => pending.splice(0) };
    const untouched = { pullDomainEvents: (): IDomainEvent[] => [] };

    const collected = await inScope(async () => {
      EventCollector.collectFrom(clip);
      EventCollector.collectFrom([clip, untouched]);

      return EventCollector.drain();
    });
    EventCollector.collectFrom(untouched);

    expect(collected).toHaveLength(2);
    expect(report).not.toHaveBeenCalled();
  });
});
