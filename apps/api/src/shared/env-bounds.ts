import type { z } from "zod";

/**
 * The three sweep-timeout bounds only work nested: the sweep must be able to finish
 * and answer before the socket closes, and the socket must close before the client
 * gives up. A `.env` that inverts them silently reproduces the bug this configuration
 * exists to prevent, so it fails the boot instead.
 *
 * Kept out of `env.ts` so tests can exercise the comparisons against plain literals:
 * `env.ts` parses `process.env` at import time and throws on missing required vars,
 * so anything imported from it would require a full `.env`.
 */
export function validateEnvBounds(
  value: {
    SERVER_IDLE_TIMEOUT_SECONDS: number;
    SWEEP_DEADLINE_MS: number;
    INTERNAL_FETCH_TIMEOUT_MS: number;
  },
  ctx: z.RefinementCtx,
): void {
  const idleMs = value.SERVER_IDLE_TIMEOUT_SECONDS * 1000;
  if (value.SWEEP_DEADLINE_MS >= idleMs) {
    ctx.addIssue({
      code: "custom",
      path: ["SWEEP_DEADLINE_MS"],
      message: `SWEEP_DEADLINE_MS (${value.SWEEP_DEADLINE_MS}) must be below SERVER_IDLE_TIMEOUT_SECONDS (${value.SERVER_IDLE_TIMEOUT_SECONDS}s = ${idleMs}ms), or the socket closes before the sweep can answer.`,
    });
  }
  if (value.INTERNAL_FETCH_TIMEOUT_MS <= idleMs) {
    ctx.addIssue({
      code: "custom",
      path: ["INTERNAL_FETCH_TIMEOUT_MS"],
      message: `INTERNAL_FETCH_TIMEOUT_MS (${value.INTERNAL_FETCH_TIMEOUT_MS}) must exceed SERVER_IDLE_TIMEOUT_SECONDS (${value.SERVER_IDLE_TIMEOUT_SECONDS}s = ${idleMs}ms), or the client gives up before the server answers.`,
    });
  }
}
