import { describe, expect, it } from "bun:test";
import { isSweepLate } from "../../../application/services/sweep-cadence";

const NOW = new Date("2026-10-31T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("isSweepLate", () => {
  it("gives a daily sweep a full day plus its margin", () => {
    expect(isSweepLate({ label: "sweep-outbox", finishedAt: ago(25 * HOUR_MS) }, NOW)).toBe(false);
    expect(isSweepLate({ label: "sweep-outbox", finishedAt: ago(27 * HOUR_MS) }, NOW)).toBe(true);
  });

  it("holds the per-minute flush to its own cadence", () => {
    const label = "flush-notification-emails";

    expect(isSweepLate({ label, finishedAt: ago(5 * 60_000) }, NOW)).toBe(false);
    expect(isSweepLate({ label, finishedAt: ago(HOUR_MS) }, NOW)).toBe(true);
  });
});
