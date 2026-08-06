import { Hono } from "hono";
import { di } from "../container";
import { env } from "../shared/env";
import { type ApiTokenVariables, requireApiToken } from "../shared/middleware/api-token.middleware";
import { requireRateLimit } from "../shared/middleware/rate-limit.middleware";
import { API_TOKEN_IP_POLICY, API_TOKEN_POLICY } from "../shared/middleware/rate-limit.policies";
import { mePublicRoutes } from "./v1/me.routes";
import { orgsPublicRoutes } from "./v1/organizations.routes";

export const publicApiV1 = new Hono<{ Variables: ApiTokenVariables }>()
  .use(
    "*",
    requireApiToken(
      {
        repo: di.IApiTokenRepository,
        outbox: di.IOutboxRepository,
        prefix: env.API_TOKEN_PREFIX,
        pepper: env.API_TOKEN_PEPPER ?? "dev-only-pepper-not-for-production-use",
        pepperVersion: env.API_TOKEN_PEPPER_VERSION,
        pepperPrevious: env.API_TOKEN_PEPPER_PREVIOUS,
        bucketMin: env.API_TOKEN_LAST_USED_BUCKET_MIN,
        platformAdminIds: env.PLATFORM_ADMIN_IDS,
      },
      { scopes: [] },
    ),
  )
  .use("*", requireRateLimit({ limiter: di.IRateLimiter }, API_TOKEN_POLICY))
  .use("*", requireRateLimit({ limiter: di.IRateLimiter }, API_TOKEN_IP_POLICY))
  .route("/me", mePublicRoutes)
  .route("/organizations", orgsPublicRoutes);
