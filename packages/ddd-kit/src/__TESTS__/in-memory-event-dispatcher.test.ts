import { describe, expect, it } from "vitest";
import type { IDomainEvent } from "../domain/domain-event";
import { InMemoryEventDispatcher } from "../events/in-memory-event-dispatcher";

const event: IDomainEvent = {
  eventId: "0190a3c2-7b4d-7e8f-9a0b-1c2d3e4f5a6b",
  eventType: "user.created",
  dateOccurred: new Date("2026-01-01"),
  aggregateId: "agg-1",
  payload: {},
};

describe("InMemoryEventDispatcher", () => {
  it("given a handler named on an event type, when a second one takes the same name, then subscribe refuses it", () => {
    const dispatcher = new InMemoryEventDispatcher();
    dispatcher.subscribe("user.created", "audit-log", () => {});

    const second = dispatcher.subscribe("user.created", "audit-log", () => {});
    const otherType = dispatcher.subscribe("user.deleted", "audit-log", () => {});

    expect(second.isFailure).toBe(true);
    expect(second.getError()).toBe("DUPLICATE_HANDLER: audit-log");
    expect(otherType.isSuccess).toBe(true);
  });

  it("given a handler name that is not kebab-case, when subscribed, then it is refused", () => {
    const dispatcher = new InMemoryEventDispatcher();

    const refused = ["Audit", "audit_log", "audit--log", "-audit", ""].map((name) =>
      dispatcher.subscribe("user.created", name, () => {}),
    );

    expect(refused.every((result) => result.isFailure)).toBe(true);
    expect(dispatcher.handlersOf("user.created")).toEqual([]);
  });

  it("given two handlers on a type, when one is run by its name, then only that one runs and reports ok", async () => {
    const dispatcher = new InMemoryEventDispatcher();
    const ran: string[] = [];
    dispatcher.subscribe("user.created", "audit-log", () => {
      ran.push("audit-log");
    });
    dispatcher.subscribe("user.created", "webhook-fanout", () => {
      ran.push("webhook-fanout");
    });

    const outcome = await dispatcher.run(event, "webhook-fanout");

    expect(ran).toEqual(["webhook-fanout"]);
    expect(outcome).toEqual({ name: "webhook-fanout", ok: true });
  });

  it("given a throwing handler, when run, then it is reported failed with its message", async () => {
    const dispatcher = new InMemoryEventDispatcher();
    dispatcher.subscribe("user.created", "audit-log", async () => {
      throw new Error("audit table locked");
    });

    const outcome = await dispatcher.run(event, "audit-log");

    expect(outcome).toEqual({ name: "audit-log", ok: false, error: "audit table locked" });
  });

  it("given several handlers, when listed, then their names come in subscription order", () => {
    const dispatcher = new InMemoryEventDispatcher();
    dispatcher.subscribe("user.created", "webhook-fanout", () => {});
    dispatcher.subscribe("user.created", "audit-log", () => {});
    dispatcher.subscribe("user.created", "notification-fanout", () => {});

    expect(dispatcher.handlersOf("user.created")).toEqual([
      "webhook-fanout",
      "audit-log",
      "notification-fanout",
    ]);
  });

  it("given a name nobody subscribed on the event type, when run, then the outcome is a failure", async () => {
    const dispatcher = new InMemoryEventDispatcher();
    dispatcher.subscribe("user.deleted", "audit-log", () => {});

    const outcome = await dispatcher.run(event, "audit-log");

    expect(outcome).toEqual({
      name: "audit-log",
      ok: false,
      error: "UNKNOWN_HANDLER: audit-log on user.created",
    });
  });
});
