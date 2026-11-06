import { describe, expect, it } from "bun:test";
import { derivedEventId } from "../event-emitter";

describe("derivedEventId", () => {
  it("gives a delivery and its replay the same id, so the outbox keeps one row", () => {
    expect(derivedEventId("evt_1", "billing.payment_failed")).toBe(
      derivedEventId("evt_1", "billing.payment_failed"),
    );
  });

  it("separates two events and two facts of one event", () => {
    const base = derivedEventId("evt_1", "billing.payment_failed");

    expect(derivedEventId("evt_2", "billing.payment_failed")).not.toBe(base);
    expect(derivedEventId("evt_1", "billing.subscription.updated")).not.toBe(base);
  });
});
