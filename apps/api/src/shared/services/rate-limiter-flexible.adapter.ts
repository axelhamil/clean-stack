import { Result } from "@packages/ddd-kit";
import { type RateLimitDbClient, rateLimitSchema } from "@packages/drizzle";
import type { RateLimiterAbstract } from "rate-limiter-flexible";
import { RateLimiterDrizzle, RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type {
  IRateLimiter,
  RateLimitDecision,
  RateLimitError,
  WindowConfig,
} from "../ports/rate-limiter.port";

export type RateLimiterFactory = (window: WindowConfig) => RateLimiterAbstract;

export function memoryFactory(window: WindowConfig): RateLimiterAbstract {
  return new RateLimiterMemory({
    keyPrefix: `${window.policyName}:${window.windowSec}`,
    points: window.maxRequests,
    duration: window.windowSec,
  });
}

export function makeDrizzleFactory(client: RateLimitDbClient): RateLimiterFactory {
  // clearExpiredByTimeout stays at the lib default (true): its unref'd 5-min purge timer
  // owns rate_limit cleanup, sparing a sweep route for this ephemeral infra table.
  return function drizzleFactory(window: WindowConfig): RateLimiterAbstract {
    return new RateLimiterDrizzle({
      storeClient: client,
      schema: rateLimitSchema.rateLimitRecord,
      keyPrefix: `${window.policyName}:${window.windowSec}`,
      points: window.maxRequests,
      duration: window.windowSec,
      inMemoryBlockOnConsumed: window.maxRequests,
      inMemoryBlockDuration: window.windowSec,
    } as never);
  };
}

export function storeFactoryFor(
  store: "memory" | "postgres",
  clientFactory?: () => RateLimitDbClient,
): RateLimiterFactory {
  if (store === "postgres") {
    if (!clientFactory) {
      throw new Error("RateLimitDbClient factory is required for the postgres store");
    }
    return makeDrizzleFactory(clientFactory());
  }
  return memoryFactory;
}

const SPAN_NAME = "RateLimiterFlexibleAdapter > consume";

export class RateLimiterFlexibleAdapter implements IRateLimiter {
  private readonly limiters = new Map<string, RateLimiterAbstract>();

  constructor(
    private readonly instrumentation: IInstrumentation,
    private readonly factory: RateLimiterFactory,
  ) {}

  async consume(
    key: string,
    windows: WindowConfig[],
  ): Promise<Result<RateLimitDecision, RateLimitError>> {
    return this.instrumentation.startSpan({ name: SPAN_NAME }, async () => {
      try {
        let tightest: RateLimitDecision | null = null;

        for (const window of windows) {
          const decision = await this.consumeWindow(key, window);
          if (!decision.allowed) return Result.ok<RateLimitDecision, RateLimitError>(decision);
          if (!tightest || decision.remaining < tightest.remaining) tightest = decision;
        }

        if (!tightest) {
          return Result.ok<RateLimitDecision, RateLimitError>({
            allowed: true,
            limit: 0,
            remaining: 0,
            resetSeconds: 0,
            policyName: "",
            firstBlock: false,
          });
        }

        return Result.ok<RateLimitDecision, RateLimitError>(tightest);
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail<RateLimitDecision, RateLimitError>({
          code: "RATE_LIMITER_INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "rate limiter error",
        });
      }
    });
  }

  private async consumeWindow(key: string, window: WindowConfig): Promise<RateLimitDecision> {
    try {
      return toDecision(window, await this.getLimiter(window).consume(key), true);
    } catch (err) {
      if (err instanceof RateLimiterRes) return toDecision(window, err, false);
      throw err;
    }
  }

  private getLimiter(window: WindowConfig): RateLimiterAbstract {
    const cacheKey = `${window.policyName}:${window.windowSec}`;
    const existing = this.limiters.get(cacheKey);
    if (existing) return existing;
    const limiter = this.factory(window);
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
    // RateLimiterDrizzle returns msBeforeNext=-1 when expire IS NULL (no-expiry row).
    // Math.max(0, ...) prevents a negative resetSeconds from producing Retry-After: -1.
    resetSeconds: Math.max(0, Math.ceil((res.msBeforeNext ?? 0) / 1000)),
    policyName: window.policyName,
    firstBlock: !allowed && res.consumedPoints === window.maxRequests + 1,
  };
}
