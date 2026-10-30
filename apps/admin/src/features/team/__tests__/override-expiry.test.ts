import { describe, expect, it } from "vitest";
import { overrideExpiryOf } from "../override-expiry";

describe("overrideExpiryOf", () => {
  it("means no end date when the day is left empty", () => {
    expect(overrideExpiryOf("")).toBeNull();
  });

  it("keeps the override live through the whole chosen day, even a day chosen for today", () => {
    expect(overrideExpiryOf("2030-01-15")).toBe(new Date("2030-01-15T23:59:59.999").toISOString());
  });
});
