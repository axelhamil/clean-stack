import type { Context } from "hono";
import { Hono } from "hono";
import {
  type ApiTokenDeps,
  type ApiTokenVariables,
  requireApiToken,
} from "../shared/middleware/api-token.middleware";
import { requireRateLimit } from "../shared/middleware/rate-limit.middleware";
import { API_TOKEN_IP_POLICY, API_TOKEN_POLICY } from "../shared/middleware/rate-limit.policies";
import type { IRateLimiter } from "../shared/ports/rate-limiter.port";
import { mePublicRoutes } from "./v1/me.routes";
import { orgsPublicRoutes } from "./v1/organizations.routes";

export interface PublicApiV1Deps extends ApiTokenDeps {
  limiter: IRateLimiter;
  resolveIp: (c: Context) => string;
}

export function createPublicApiV1(deps: PublicApiV1Deps): Hono<{ Variables: ApiTokenVariables }> {
  const ipPolicy = {
    ...API_TOKEN_IP_POLICY,
    keyFn: (c: Context) => `tokip:${deps.resolveIp(c)}`,
  };

  return new Hono<{ Variables: ApiTokenVariables }>()
    .use("*", requireApiToken(deps, { scopes: [] }))
    .use("*", requireRateLimit({ limiter: deps.limiter }, API_TOKEN_POLICY))
    .use("*", requireRateLimit({ limiter: deps.limiter }, ipPolicy))
    .route("/me", mePublicRoutes)
    .route("/organizations", orgsPublicRoutes);
}
