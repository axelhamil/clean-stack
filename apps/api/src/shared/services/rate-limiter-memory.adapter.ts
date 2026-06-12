import { Result } from "@packages/ddd-kit";
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type {
  IRateLimiter,
  RateLimitDecision,
  RateLimitError,
  WindowConfig,
} from "../ports/rate-limiter.port";

export class RateLimiterMemoryAdapter implements IRateLimiter {
  private readonly limiters = new Map<string, RateLimiterMemory>();

  constructor(private readonly instrumentation: IInstrumentation) {}

  async consume(
    key: string,
    windows: WindowConfig[],
  ): Promise<Result<RateLimitDecision, RateLimitError>> {
    return this.instrumentation.startSpan(
      { name: "RateLimiterMemoryAdapter > consume" },
      async () => {
        try {
          let tightest: RateLimitDecision | null = null;

          for (const window of windows) {
            const decision = await this.consumeWindow(key, window);
            if (!decision.allowed) return Result.ok<RateLimitDecision, RateLimitError>(decision);
            if (!tightest || decision.remaining < tightest.remaining) tightest = decision;
          }

          return Result.ok<RateLimitDecision, RateLimitError>(tightest as RateLimitDecision);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail<RateLimitDecision, RateLimitError>({
            code: "RATE_LIMITER_INTERNAL_ERROR",
            message: err instanceof Error ? err.message : "rate limiter error",
          });
        }
      },
    );
  }

  private async consumeWindow(key: string, window: WindowConfig): Promise<RateLimitDecision> {
    try {
      return toDecision(window, await this.getLimiter(window).consume(key), true);
    } catch (err) {
      if (err instanceof RateLimiterRes) return toDecision(window, err, false);
      throw err;
    }
  }

  private getLimiter(window: WindowConfig): RateLimiterMemory {
    const cacheKey = `${window.policyName}:${window.windowSec}`;
    const existing = this.limiters.get(cacheKey);
    if (existing) return existing;

    const limiter = new RateLimiterMemory({
      keyPrefix: cacheKey,
      points: window.maxRequests,
      duration: window.windowSec,
    });
    this.limiters.set(cacheKey, limiter);
    return limiter;
  }
}

function toDecision(
  window: WindowConfig,
  res: RateLimiterRes,
  allowed: boolean,
): RateLimitDecision {
  return {
    allowed,
    limit: window.maxRequests,
    remaining: res.remainingPoints ?? 0,
    resetSeconds: Math.ceil((res.msBeforeNext ?? 0) / 1000),
    policyName: window.policyName,
  };
}
