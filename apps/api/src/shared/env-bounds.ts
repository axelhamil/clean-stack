import type { z } from "zod";
import {
  DEADLINE_FLUSH_TIMEOUT_MS,
  GRACE_MARGIN_MS,
  TELEMETRY_FLUSH_MARGIN_MS,
  TELEMETRY_FLUSH_TIMEOUT_MS,
  worstCaseShutdownMs,
} from "./shutdown";

/**
 * The sweep-timeout bounds only work nested: the sweep must be able to finish and
 * answer before the socket closes, and the socket must close before the client gives
 * up. The shutdown bounds only work when the deadline covers the worst case of every
 * step plus the margins the shutdown adds. A `.env` that breaks either silently
 * reproduces the bug its configuration exists to prevent, so it fails the boot instead.
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
    SHUTDOWN_GRACE_PERIOD_MS: number;
    SHUTDOWN_STEP_TIMEOUT_MS: number;
    SHUTDOWN_WORKERS_TIMEOUT_MS: number;
    SHUTDOWN_DEADLINE_MS: number;
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

  const shutdownBudgetMs = worstCaseShutdownMs({
    graceMs: value.SHUTDOWN_GRACE_PERIOD_MS,
    stepMs: value.SHUTDOWN_STEP_TIMEOUT_MS,
    workersMs: value.SHUTDOWN_WORKERS_TIMEOUT_MS,
  });
  if (shutdownBudgetMs > value.SHUTDOWN_DEADLINE_MS) {
    ctx.addIssue({
      code: "custom",
      path: ["SHUTDOWN_DEADLINE_MS"],
      message: `SHUTDOWN_DEADLINE_MS (${value.SHUTDOWN_DEADLINE_MS}) must cover the worst-case shutdown (${shutdownBudgetMs}ms): SHUTDOWN_GRACE_PERIOD_MS + ${GRACE_MARGIN_MS}, 2 x SHUTDOWN_STEP_TIMEOUT_MS (http, database pool), SHUTDOWN_WORKERS_TIMEOUT_MS, the ${TELEMETRY_FLUSH_TIMEOUT_MS + TELEMETRY_FLUSH_MARGIN_MS}ms telemetry flush and the ${DEADLINE_FLUSH_TIMEOUT_MS}ms deadline flush, or a slow but healthy shutdown is cut by the deadline and exits 1.`,
    });
  }
}
