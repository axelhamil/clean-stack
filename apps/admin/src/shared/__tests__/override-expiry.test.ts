import { describe, expect, it } from "vitest";
import { overrideExpiryOf } from "../override-expiry";

const NOW = new Date("2030-01-15T12:00:00");

describe("overrideExpiryOf", () => {
  it("means no end date when the day is left empty", () => {
    expect(overrideExpiryOf("", NOW)).toEqual({ kind: "none" });
  });

  it("keeps the override live through the whole chosen day, even a day chosen for today", () => {
    expect(overrideExpiryOf("2030-01-15", NOW)).toEqual({
      kind: "at",
      iso: new Date("2030-01-15T23:59:59.999").toISOString(),
    });
  });

  it("refuses a past day, which the server would reject", () => {
    expect(overrideExpiryOf("2030-01-14", NOW)).toEqual({ kind: "invalid" });
  });

  it("refuses a year a browser date field accepts but a date cannot hold", () => {
    expect(overrideExpiryOf("275760-12-31", NOW)).toEqual({ kind: "invalid" });
    expect(overrideExpiryOf("2041-01-01", NOW)).toEqual({ kind: "invalid" });
  });
});
