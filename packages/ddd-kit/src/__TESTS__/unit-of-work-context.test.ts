import { describe, expect, it } from "vitest";
import { EventCollector, type IDomainEvent, UnitOfWorkContext } from "../index";

const eventOf = (aggregateId: string): IDomainEvent => ({
  eventType: "test.event",
  dateOccurred: new Date("2026-10-29T10:00:00Z"),
  aggregateId,
  payload: {},
});

const later = <T>(ms: number, read: () => T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(read()), ms));

describe("UnitOfWorkContext", () => {
  it("given a transaction, when read outside and inside a run, then transaction() is undefined outside a run and the tx inside it", async () => {
    const tx = { name: "tx-1" };

    const inside = await UnitOfWorkContext.run(tx, async () =>
      UnitOfWorkContext.transaction<typeof tx>(),
    );

    expect(inside).toBe(tx);
    expect(UnitOfWorkContext.transaction()).toBeUndefined();
  });

  it("given a promise started in a run, when it reads after the run ended, then a promise that outlives its run reads no transaction (closed scope)", async () => {
    const tx = { name: "tx-1" };

    const { early, late } = await UnitOfWorkContext.run(tx, async () => ({
      early: UnitOfWorkContext.transaction<typeof tx>(),
      late: later(10, () => UnitOfWorkContext.transaction<typeof tx>()),
    }));

    expect(early).toBe(tx);
    expect(await late).toBeUndefined();
  });

  it("given nested scopes, when each adds an event, then events added in a scope are drained from that scope only", async () => {
    const { outer, inner } = await UnitOfWorkContext.run(undefined, async () => {
      EventCollector.add(eventOf("outer"));
      const innerDrained = await UnitOfWorkContext.run(undefined, async () => {
        EventCollector.add(eventOf("inner"));

        return EventCollector.drain();
      });

      return { outer: EventCollector.drain(), inner: innerDrained };
    });

    expect(inner.map((event) => event.aggregateId)).toEqual(["inner"]);
    expect(outer.map((event) => event.aggregateId)).toEqual(["outer"]);
  });
});
