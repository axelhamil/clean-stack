import { describe, expect, it } from "vitest";
import { EVENT_DESCRIPTIONS } from "../event-descriptions";
import { EventTypes, INTERNAL_EVENT_TYPES, SUBSCRIBABLE_EVENT_TYPES } from "../event-types";
import { retentionFor } from "../retention-map";

describe("email events", () => {
  it("email.delivery.exhausted is internal, operational, and described", () => {
    expect(EventTypes.EMAIL_DELIVERY_EXHAUSTED).toBe("email.delivery.exhausted");
    expect(INTERNAL_EVENT_TYPES).toContain(EventTypes.EMAIL_DELIVERY_EXHAUSTED);
    expect(SUBSCRIBABLE_EVENT_TYPES).not.toContain(EventTypes.EMAIL_DELIVERY_EXHAUSTED);
    expect(retentionFor(EventTypes.EMAIL_DELIVERY_EXHAUSTED)).toBe("operational");
    expect(EVENT_DESCRIPTIONS[EventTypes.EMAIL_DELIVERY_EXHAUSTED]).toBeTruthy();
  });
});
