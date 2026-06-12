import type { Result } from "@packages/ddd-kit";

export interface WindowConfig {
  policyName: string;
  windowSec: number;
  maxRequests: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
  policyName: string;
  /**
   * True only on the first consume that crosses the limit
   * (consumedPoints === maxRequests + 1). Used by the middleware to emit
   * `security.rate_limit.exceeded` exactly once per burst.
   * Always false on allowed decisions.
   */
  firstBlock: boolean;
}

export type RateLimitError = { code: "RATE_LIMITER_INTERNAL_ERROR"; message: string };

export interface IRateLimiter {
  consume(key: string, windows: WindowConfig[]): Promise<Result<RateLimitDecision, RateLimitError>>;
}
