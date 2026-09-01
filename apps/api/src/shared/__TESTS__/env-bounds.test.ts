import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { validateEnvBounds } from "../env";

// Exercises the real guard (`superRefine` in env.ts) against plain literals — never
// imports `env` itself, since env.ts parses `process.env` at import time and throws
// on a missing `DATABASE_URL` and friends. No `.env` required for this file.
const boundsSchema = z
  .object({
    SERVER_IDLE_TIMEOUT_SECONDS: z.number(),
    SWEEP_DEADLINE_MS: z.number(),
    INTERNAL_FETCH_TIMEOUT_MS: z.number(),
  })
  .superRefine(validateEnvBounds);

describe("validateEnvBounds", () => {
  it("accepts the three defaults", () => {
    const result = boundsSchema.safeParse({
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 90_000,
      INTERNAL_FETCH_TIMEOUT_MS: 150_000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects SWEEP_DEADLINE_MS equal to the idle timeout in ms (boundary)", () => {
    const result = boundsSchema.safeParse({
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 120_000,
      INTERNAL_FETCH_TIMEOUT_MS: 150_000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects SWEEP_DEADLINE_MS above the idle timeout in ms", () => {
    const result = boundsSchema.safeParse({
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 130_000,
      INTERNAL_FETCH_TIMEOUT_MS: 150_000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects INTERNAL_FETCH_TIMEOUT_MS equal to the idle timeout in ms (boundary)", () => {
    const result = boundsSchema.safeParse({
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 90_000,
      INTERNAL_FETCH_TIMEOUT_MS: 120_000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects INTERNAL_FETCH_TIMEOUT_MS below the idle timeout in ms", () => {
    const result = boundsSchema.safeParse({
      SERVER_IDLE_TIMEOUT_SECONDS: 120,
      SWEEP_DEADLINE_MS: 90_000,
      INTERNAL_FETCH_TIMEOUT_MS: 100_000,
    });
    expect(result.success).toBe(false);
  });
});
