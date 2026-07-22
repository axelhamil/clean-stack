import { describe, expect, it } from "vitest";
import { descriptionFor, EVENT_DESCRIPTIONS } from "../event-descriptions";
import { ALL_EVENT_TYPES } from "../event-types";

describe("EVENT_DESCRIPTIONS", () => {
  it("has a non-empty description for every event type", () => {
    for (const type of ALL_EVENT_TYPES) {
      expect(EVENT_DESCRIPTIONS[type], type).toBeTruthy();
      expect(EVENT_DESCRIPTIONS[type].length).toBeGreaterThan(4);
    }
  });

  it("descriptionFor falls back to empty string for unknown types", () => {
    expect(descriptionFor("not.a.real.event")).toBe("");
    expect(descriptionFor("user.created")).toBe(EVENT_DESCRIPTIONS["user.created"]);
  });
});
