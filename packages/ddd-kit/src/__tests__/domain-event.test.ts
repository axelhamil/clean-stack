import { describe, expect, it } from "vitest";
import { BaseDomainEvent } from "../index";

class DatedEvent extends BaseDomainEvent<{ id: string }> {
  readonly eventType = "test.dated";
  readonly aggregateId = "agg-1";
  readonly payload = { id: "agg-1" };
}

describe("BaseDomainEvent", () => {
  it("gets its own uuidv7 event id and keeps the occurrence date it is given", () => {
    const occurredAt = new Date("2026-03-04T05:06:07.000Z");

    const first = new DatedEvent(occurredAt);
    const second = new DatedEvent();

    expect(first.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(second.eventId).not.toBe(first.eventId);
    expect(first.dateOccurred).toBe(occurredAt);
  });
});
