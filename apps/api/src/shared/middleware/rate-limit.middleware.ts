import { AppErrorException } from "@packages/ddd-kit";
import { createMiddleware } from "hono/factory";
import { logger } from "../logger";
import type { IRateLimiter } from "../ports/rate-limiter.port";
import type { PolicyConfig } from "./rate-limit.policies";

export function requireRateLimit(limiter: IRateLimiter, policy: PolicyConfig) {
  return createMiddleware(async (c, next) => {
    const key = policy.keyFn(c);
    const result = await limiter.consume(key, policy.windows);

    if (result.isFailure) {
      logger.warn({ policy: policy.name, key }, "rate limiter internal error — failing open");
      return next();
    }

    const decision = result.getValue();

    const policyHeader = policy.windows
      .map((w) => `"${w.policyName}";q=${w.maxRequests};w=${w.windowSec}`)
      .join(", ");
    c.header("RateLimit-Policy", policyHeader);
    c.header(
      "RateLimit",
      `"${decision.policyName}";r=${decision.remaining};t=${decision.resetSeconds}`,
    );

    if (!decision.allowed) {
      c.header("Retry-After", String(decision.resetSeconds));
      throw new AppErrorException({
        code: "SECURITY_RATE_LIMITED",
        message: "Too many requests",
        metadata: { retryAfter: decision.resetSeconds },
      });
    }

    await next();
  });
}
