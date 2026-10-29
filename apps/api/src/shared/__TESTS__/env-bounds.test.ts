import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { OUTBOX_SETTLE_MARGIN_SECONDS, validateEnvBounds } from "../env-bounds";

// Exercises the real guard (`superRefine` in env.ts) against plain literals. Never
// imports `env.ts` itself, since env.ts parses `process.env` at import time and throws
// on a missing `DATABASE_URL` and friends. No `.env` required for this file.
const boundsSchema = z
  .object({
    SERVER_IDLE_TIMEOUT_SECONDS: z.number(),
    SWEEP_DEADLINE_MS: z.number(),
    INTERNAL_FETCH_TIMEOUT_MS: z.number(),
    SHUTDOWN_GRACE_PERIOD_MS: z.number(),
    SHUTDOWN_STEP_TIMEOUT_MS: z.number(),
    SHUTDOWN_WORKERS_TIMEOUT_MS: z.number(),
    SHUTDOWN_DEADLINE_MS: z.number(),
    OUTBOX_LEASE_SECONDS: z.number(),
    OUTBOX_HANDLER_BUDGET_SECONDS: z.number(),
  })
  .superRefine(validateEnvBounds);

const SHUTDOWN_DEFAULTS = {
  SHUTDOWN_GRACE_PERIOD_MS: 15_000,
  SHUTDOWN_STEP_TIMEOUT_MS: 2_000,
  SHUTDOWN_WORKERS_TIMEOUT_MS: 12_000,
  SHUTDOWN_DEADLINE_MS: 36_000,
};

const OUTBOX_DEFAULTS = {
  OUTBOX_LEASE_SECONDS: 120,
  OUTBOX_HANDLER_BUDGET_SECONDS: 30,
};

describe("validateEnvBounds", () => {
  it("accepts the three defaults", () => {
    const result = boundsSchema.safeParse({
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 90_000,
      INTERNAL_FETCH_TIMEOUT_MS: 150_000,
      ...SHUTDOWN_DEFAULTS,
      ...OUTBOX_DEFAULTS,
    });
    expect(result.success).toBe(true);
  });

  it("rejects SWEEP_DEADLINE_MS equal to the idle timeout in ms (boundary)", () => {
    const result = boundsSchema.safeParse({
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 120_000,
      INTERNAL_FETCH_TIMEOUT_MS: 150_000,
      ...SHUTDOWN_DEFAULTS,
      ...OUTBOX_DEFAULTS,
    });
    expect(result.success).toBe(false);
  });

  it("rejects SWEEP_DEADLINE_MS above the idle timeout in ms", () => {
    const result = boundsSchema.safeParse({
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 130_000,
      INTERNAL_FETCH_TIMEOUT_MS: 150_000,
      ...SHUTDOWN_DEFAULTS,
      ...OUTBOX_DEFAULTS,
    });
    expect(result.success).toBe(false);
  });

  it("rejects INTERNAL_FETCH_TIMEOUT_MS equal to the idle timeout in ms (boundary)", () => {
    const result = boundsSchema.safeParse({
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 90_000,
      INTERNAL_FETCH_TIMEOUT_MS: 120_000,
      ...SHUTDOWN_DEFAULTS,
      ...OUTBOX_DEFAULTS,
    });
    expect(result.success).toBe(false);
  });

  it("rejects INTERNAL_FETCH_TIMEOUT_MS below the idle timeout in ms", () => {
    const result = boundsSchema.safeParse({
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 90_000,
      INTERNAL_FETCH_TIMEOUT_MS: 100_000,
      ...SHUTDOWN_DEFAULTS,
      ...OUTBOX_DEFAULTS,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a shutdown deadline equal to the worst case and rejects one millisecond less", () => {
    const sweepBounds = {
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 90_000,
      INTERNAL_FETCH_TIMEOUT_MS: 150_000,
    };
    const worstCaseMs = 15_000 + 1_000 + 2_000 + 12_000 + 2_000 + 2_000 + 500 + 1_000;

    const atBudget = boundsSchema.safeParse({
      ...sweepBounds,
      ...SHUTDOWN_DEFAULTS,
      ...OUTBOX_DEFAULTS,
      SHUTDOWN_DEADLINE_MS: worstCaseMs,
    });
    const belowBudget = boundsSchema.safeParse({
      ...sweepBounds,
      ...SHUTDOWN_DEFAULTS,
      ...OUTBOX_DEFAULTS,
      SHUTDOWN_DEADLINE_MS: worstCaseMs - 1,
    });

    expect(atBudget.success).toBe(true);
    expect(belowBudget.success).toBe(false);
  });

  it("rejects an outbox lease that leaves no settle margin after one handler budget and accepts the exact margin", () => {
    const bounds = {
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 90_000,
      INTERNAL_FETCH_TIMEOUT_MS: 150_000,
      ...SHUTDOWN_DEFAULTS,
    };

    const withMargin = boundsSchema.safeParse({
      ...bounds,
      OUTBOX_LEASE_SECONDS: 30 + OUTBOX_SETTLE_MARGIN_SECONDS,
      OUTBOX_HANDLER_BUDGET_SECONDS: 30,
    });
    const equalToBudget = boundsSchema.safeParse({
      ...bounds,
      OUTBOX_LEASE_SECONDS: 30,
      OUTBOX_HANDLER_BUDGET_SECONDS: 30,
    });

    expect(withMargin.success).toBe(true);
    expect(equalToBudget.success).toBe(false);
  });
});
