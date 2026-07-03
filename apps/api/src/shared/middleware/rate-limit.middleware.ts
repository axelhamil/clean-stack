import { AppErrorException } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { createMiddleware } from "hono/factory";
import { emitEvent } from "../event-emitter";
import { logger } from "../logger";
import type { IOutboxRepository } from "../ports/outbox.port";
import type { IRateLimiter } from "../ports/rate-limiter.port";
import { resolveClientIp } from "./rate-limit.ip";
import type { PolicyConfig } from "./rate-limit.policies";

export interface RateLimitDeps {
  limiter: IRateLimiter;
  outbox?: IOutboxRepository;
}

export function requireRateLimit(deps: RateLimitDeps, policy: PolicyConfig) {
  if (policy.emitSecurityEvent && !deps.outbox) {
    logger.warn(
      { policy: policy.name },
      "rate-limit: emitSecurityEvent=true but no outbox provided — security events silently disabled",
    );
  }

  return createMiddleware(async (c, next) => {
    const key = policy.keyFn(c);
    const result = await deps.limiter.consume(key, policy.windows);

    if (result.isFailure) {
      if (policy.failClosed) {
        // 503 routes through the central error handler (logs at error + Sentry capture);
        // a store outage must not silently disable brute-force protection (OWASP A10:2025).
        throw new AppErrorException({
          code: "RATE_LIMITER_UNAVAILABLE",
          message: "Service temporarily unavailable",
        });
      }
      logger.warn({ policy: policy.name, key }, "rate limiter internal error — failing open");
      return next();
    }

    const decision = result.getValue();
    const advertise = policy.advertiseBudget !== false;

    if (advertise) {
      const policyHeader = policy.windows
        .map((w) => `"${w.policyName}";q=${w.maxRequests};w=${w.windowSec}`)
        .join(", ");
      c.header("RateLimit-Policy", policyHeader);
      c.header(
        "RateLimit",
        `"${decision.policyName}";r=${decision.remaining};t=${decision.resetSeconds}`,
      );
    }

    if (!decision.allowed) {
      // Floor to 1 so clients never see Retry-After: 0 and hammer immediately.
      const retryAfter = Math.max(1, decision.resetSeconds);
      c.header("Retry-After", String(retryAfter));

      if (decision.firstBlock && policy.emitSecurityEvent && deps.outbox) {
        const rawIp = resolveClientIp(c);
        const user = c.get("user") as { id: string } | null | undefined;
        // Truncate before building payload — Zod bounds on SecurityRateLimitExceededPayload
        // would reject at enqueue and silently swallow the emit if not pre-clamped.
        const ip = rawIp.slice(0, 45);
        const path = c.req.path.slice(0, 512);
        const method = c.req.method.slice(0, 16);
        const policyName = decision.policyName.slice(0, 64);
        try {
          await emitEvent(
            deps.outbox,
            EventTypes.SECURITY_RATE_LIMIT_EXCEEDED,
            "rate_limit",
            `${policy.name}:${ip}`,
            {
              actorUserId: user?.id ?? null,
              ip,
              policyName,
              path,
              method,
            },
          );
        } catch (emitErr) {
          logger.warn(
            { err: emitErr, policy: policy.name },
            "rate-limit event emit failed — still sending 429",
          );
        }
      }

      throw new AppErrorException({
        code: "SECURITY_RATE_LIMITED",
        message: "Too many requests",
        metadata: { retryAfter },
      });
    }

    await next();
  });
}
