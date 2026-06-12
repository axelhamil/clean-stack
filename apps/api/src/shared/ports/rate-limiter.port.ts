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
}

export type RateLimitError = { code: "RATE_LIMITER_INTERNAL_ERROR"; message: string };

/**
 * Security events (sampled `security.rate_limit.exceeded`) are deferred to S2
 * once the durable store lands.
 */
export interface IRateLimiter {
  consume(key: string, windows: WindowConfig[]): Promise<Result<RateLimitDecision, RateLimitError>>;
}
