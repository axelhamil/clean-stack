import { describe, expect, it } from "bun:test";
import {
  expectedDelayFromAttempts,
  isDeadLetter,
  JITTER_BASE_MS,
  JITTER_CAP_MS,
  JITTER_MAX_ATTEMPTS,
  JITTER_MULTIPLIER,
  nextAttemptAt,
  nextDelayMs,
} from "../jitter";

describe("nextDelayMs", () => {
  it("always returns >= JITTER_BASE_MS", () => {
    for (const last of [1000, 5000, 60000]) {
      for (let i = 0; i < 100; i++) {
        expect(nextDelayMs(last)).toBeGreaterThanOrEqual(JITTER_BASE_MS);
      }
    }
  });

  it("always returns <= JITTER_CAP_MS", () => {
    for (const last of [1000, 5000, 60000]) {
      for (let i = 0; i < 100; i++) {
        expect(nextDelayMs(last)).toBeLessThanOrEqual(JITTER_CAP_MS);
      }
    }
  });

  it("respects upper bound (lastDelayMs * MULTIPLIER, clamped to cap)", () => {
    for (const last of [1000, 5000, 60000]) {
      const upper = Math.min(JITTER_CAP_MS, Math.max(JITTER_BASE_MS, last * JITTER_MULTIPLIER));
      for (let i = 0; i < 100; i++) {
        expect(nextDelayMs(last)).toBeLessThanOrEqual(upper);
      }
    }
  });
});

describe("isDeadLetter", () => {
  it("returns false for attempt 4 (below JITTER_MAX_ATTEMPTS)", () => {
    expect(isDeadLetter(4)).toBe(false);
  });

  it("returns true for attempt 5 (= JITTER_MAX_ATTEMPTS)", () => {
    expect(isDeadLetter(JITTER_MAX_ATTEMPTS)).toBe(true);
  });

  it("returns true for attempt 6 (> JITTER_MAX_ATTEMPTS)", () => {
    expect(isDeadLetter(6)).toBe(true);
  });
});

describe("nextAttemptAt", () => {
  it("returns a future date when currentAttempts=0", () => {
    const before = Date.now();
    const result = nextAttemptAt(0, JITTER_BASE_MS);
    expect(result.isSome()).toBe(true);
    expect(result.unwrap().getTime()).toBeGreaterThan(before);
  });

  it("returns none when the next attempt would be dead-letter (currentAttempts=4)", () => {
    // currentAttempts + 1 = 5 = JITTER_MAX_ATTEMPTS → dead-letter
    const result = nextAttemptAt(4, JITTER_BASE_MS);
    expect(result.isNone()).toBe(true);
  });

  it("returns a date in the future between now+1s and now+12h for currentAttempts=2", () => {
    const before = Date.now();
    const result = nextAttemptAt(2, JITTER_BASE_MS);
    const after = Date.now();

    const dateMs = result.unwrap().getTime();
    expect(dateMs).toBeGreaterThanOrEqual(before + JITTER_BASE_MS);
    expect(dateMs).toBeLessThanOrEqual(after + JITTER_CAP_MS);
  });
});

describe("expectedDelayFromAttempts", () => {
  it("starts at JITTER_BASE_MS and grows by JITTER_MULTIPLIER per attempt", () => {
    expect(expectedDelayFromAttempts(0)).toBe(JITTER_BASE_MS);
    expect(expectedDelayFromAttempts(2)).toBe(JITTER_BASE_MS * JITTER_MULTIPLIER ** 2);
  });

  it("treats a negative attempt count as the first attempt", () => {
    expect(expectedDelayFromAttempts(-3)).toBe(JITTER_BASE_MS);
  });
});
