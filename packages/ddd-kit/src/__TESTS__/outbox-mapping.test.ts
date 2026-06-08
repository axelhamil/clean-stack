import { describe, expect, it } from "vitest";
import type { IDomainEvent } from "../domain/domain-event";
import { domainEventToOutboxRow } from "../events/outbox-mapping";

const event: IDomainEvent = {
  eventType: "user.created",
  dateOccurred: new Date("2026-01-01"),
  aggregateId: "agg-1",
  payload: { userId: "u1" },
};

describe("domainEventToOutboxRow", () => {
  it("stamps metadata.requestId from scope.requestId", () => {
    const row = domainEventToOutboxRow(event, {
      source: "app/api",
      aggregateType: "user",
      requestId: "req-42",
    });
    expect(row.metadata.requestId).toBe("req-42");
  });

  it("leaves metadata.requestId undefined when scope omits it", () => {
    const row = domainEventToOutboxRow(event, { source: "app/api", aggregateType: "user" });
    expect(row.metadata.requestId).toBeUndefined();
  });
});
