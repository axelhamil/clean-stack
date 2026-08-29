import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "../utils";

const D = "2026-03-09T14:05:00.000Z";

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
