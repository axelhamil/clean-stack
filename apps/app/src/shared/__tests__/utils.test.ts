import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { formatDate, formatDateTime } from "../utils";

const D = "2026-03-09T14:05:00.000Z";

// Intl.DateTimeFormat without an explicit `timeZone` renders in the runtime's
// default timezone, which `new Date(D)` can then straddle a day boundary in —
// 14:05 UTC is already tomorrow local at UTC+14 and still yesterday at
// UTC-12. Pinning TZ makes the assertions below deterministic regardless of
// where CI runs.
beforeAll(() => {
  vi.stubEnv("TZ", "UTC");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("formatDate", () => {
  it("formats day-first in French and month-first in English", () => {
    expect(formatDate(D, "fr")).toBe("09/03/2026");
    expect(formatDate(D, "en")).toBe("3/9/2026");
  });

  it("accepts a Date as well as a string", () => {
    expect(formatDate(new Date(D), "fr")).toBe("09/03/2026");
  });
});

describe("formatDateTime", () => {
  it("includes a time component", () => {
    expect(formatDateTime(D, "fr")).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(formatDateTime(D, "fr")).toMatch(/\d{2}:\d{2}/);
  });
});
