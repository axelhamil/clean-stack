import { describe, expect, it } from "bun:test";
import {
  expectedDelayFromAttempts,
  failureSchedule,
  JITTER_BASE_MS,
  JITTER_CAP_MS,
  JITTER_MULTIPLIER,
  nextDelayMs,
  retryAfterSeconds,
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

describe("expectedDelayFromAttempts", () => {
  it("starts at JITTER_BASE_MS and grows by JITTER_MULTIPLIER per attempt", () => {
    expect(expectedDelayFromAttempts(0)).toBe(JITTER_BASE_MS);
    expect(expectedDelayFromAttempts(2)).toBe(JITTER_BASE_MS * JITTER_MULTIPLIER ** 2);
  });

  it("treats a negative attempt count as the first attempt", () => {
    expect(expectedDelayFromAttempts(-3)).toBe(JITTER_BASE_MS);
  });
});

describe("retryAfterSeconds", () => {
  it("retryAfterSeconds stays within base and cap", () => {
    for (const attempts of [0, 1, 3, 8, 40]) {
      for (let i = 0; i < 50; i++) {
        const seconds = retryAfterSeconds(attempts);
        expect(seconds).toBeGreaterThanOrEqual(JITTER_BASE_MS / 1000);
        expect(seconds).toBeLessThanOrEqual(JITTER_CAP_MS / 1000);
      }
    }
  });
});

describe("failureSchedule", () => {
  const policy = { wasDead: false, maxAttempts: 5, deadRetrySeconds: 21_600 };

  it("failureSchedule keeps a live row retrying under maxAttempts", () => {
    const schedule = failureSchedule(4, policy);

    expect(schedule.dead).toBe(false);
    expect(schedule.retryAfterSeconds).toBeLessThan(policy.deadRetrySeconds);
  });

  it("failureSchedule marks dead at maxAttempts", () => {
    expect(failureSchedule(5, policy)).toEqual({ dead: true, retryAfterSeconds: 21_600 });
  });

  it("failureSchedule keeps a dead row dead and uses the dead cadence", () => {
    expect(failureSchedule(1, { ...policy, wasDead: true })).toEqual({
      dead: true,
      retryAfterSeconds: 21_600,
    });
  });
});
