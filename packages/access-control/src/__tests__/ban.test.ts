import { describe, expect, it } from "vitest";
import { isBanLive } from "../index";

const now = new Date("2026-06-01T12:00:00.000Z");
const future = new Date("2026-06-02T12:00:00.000Z");
const past = new Date("2026-05-31T12:00:00.000Z");

describe("isBanLive", () => {
  it.each([
    [false, null, false],
    [null, null, false],
    [true, null, true],
    [true, future, true],
    [true, past, false],
    [true, now, false],
  ])("banned=%s banExpires=%s is live: %s", (banned, banExpires, expected) => {
    expect(isBanLive(banned, banExpires, now)).toBe(expected);
  });
});
