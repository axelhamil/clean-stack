import { describe, expect, it } from "vitest";
import { EVENT_DESCRIPTIONS } from "../event-descriptions";
import { EventTypes, SUBSCRIBABLE_EVENT_TYPES } from "../event-types";
import { retentionFor } from "../retention-map";
import { isPublicEvent } from "../visibility-map";

describe("email events", () => {
  it("email.delivery.exhausted is internal, operational, and described", () => {
    expect(EventTypes.EMAIL_DELIVERY_EXHAUSTED).toBe("email.delivery.exhausted");
    expect(isPublicEvent(EventTypes.EMAIL_DELIVERY_EXHAUSTED)).toBe(false);
    expect(SUBSCRIBABLE_EVENT_TYPES).not.toContain(EventTypes.EMAIL_DELIVERY_EXHAUSTED);
    expect(retentionFor(EventTypes.EMAIL_DELIVERY_EXHAUSTED)).toBe("operational");
    expect(EVENT_DESCRIPTIONS[EventTypes.EMAIL_DELIVERY_EXHAUSTED]).toBeTruthy();
  });
});
