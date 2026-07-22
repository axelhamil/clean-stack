import { describe, expect, it } from "bun:test";
import { currentPeriodFor } from "../config";

describe("currentPeriodFor", () => {
  it("uses the subscription window when present", () => {
    const start = new Date("2026-07-01T00:00:00Z");
    const end = new Date("2026-08-01T00:00:00Z");
    const p = currentPeriodFor({ periodStart: start, periodEnd: end });
    expect(p.start).toEqual(start);
    expect(p.end).toEqual(end);
  });

  it("falls back to a lifetime window (epoch → far future) when the subscription has no period", () => {
    const p = currentPeriodFor({ periodStart: null, periodEnd: null });
    expect(p.start.getTime()).toBe(0);
    expect(p.end.getTime()).toBeGreaterThan(Date.now());
  });
});
