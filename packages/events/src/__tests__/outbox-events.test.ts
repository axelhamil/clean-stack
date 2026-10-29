import { describe, expect, it } from "vitest";
import { EventTypes, SUBSCRIBABLE_EVENT_TYPES } from "../event-types";
import { notificationConfigOf } from "../notification-map";
import { OUTBOX_LAST_ERROR_MAX_LENGTH, PayloadByEventType } from "../payloads";
import { retentionFor } from "../retention-map";

const dead = {
  eventId: "e1",
  eventType: "user.created",
  aggregateId: "u1",
  attempts: 10,
  lastError: "audit-log: boom",
  failedHandlers: ["audit-log"],
};

describe("outbox events", () => {
  it("outbox.event_dead is internal, operational and never notified", () => {
    expect(SUBSCRIBABLE_EVENT_TYPES).not.toContain(EventTypes.OUTBOX_EVENT_DEAD);
    expect(retentionFor(EventTypes.OUTBOX_EVENT_DEAD)).toBe("operational");
    expect(notificationConfigOf(EventTypes.OUTBOX_EVENT_DEAD)).toBeUndefined();
  });

  it("OUTBOX_EVENT_DEAD requires actorUserId to be null explicitly", () => {
    const schema = PayloadByEventType[EventTypes.OUTBOX_EVENT_DEAD];

    expect(schema.safeParse({ ...dead, actorUserId: null }).success).toBe(true);
    expect(schema.safeParse(dead).success).toBe(false);
    expect(schema.safeParse({ ...dead, actorUserId: "u1" }).success).toBe(false);
  });

  it("OUTBOX_EVENT_DEAD bounds lastError and names the failing handlers", () => {
    const schema = PayloadByEventType[EventTypes.OUTBOX_EVENT_DEAD];
    const valid = { ...dead, actorUserId: null };
    const { failedHandlers: _omitted, ...withoutHandlers } = valid;

    expect(
      schema.safeParse({ ...valid, lastError: "x".repeat(OUTBOX_LAST_ERROR_MAX_LENGTH) }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ ...valid, lastError: "x".repeat(OUTBOX_LAST_ERROR_MAX_LENGTH + 1) })
        .success,
    ).toBe(false);
    expect(schema.safeParse(withoutHandlers).success).toBe(false);
  });
});
