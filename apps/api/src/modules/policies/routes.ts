import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { acceptPoliciesDto } from "./application/dto/accept-policies.dto";
import type { PolicyAcceptanceService } from "./application/services/policy-acceptance.service";

export interface PolicyRoutesDeps {
  routeGuards: RouteGuards;
  PolicyAcceptanceService: Pick<PolicyAcceptanceService, "getStaleTypes" | "accept" | "getStatus">;
}

export function createPolicyRoutes(deps: PolicyRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .post(
      "/accept",
      g.requireAuth,
      g.denyImpersonated,
      zV("json", acceptPoliciesDto),
      async (c) => {
        const userId = g.currentUserId(c);
        const ip = g.clientIp(c);
        const body = c.req.valid("json");

        let types = body.types;
        if (!types) {
          const staleResult = await deps.PolicyAcceptanceService.getStaleTypes(userId);
          if (staleResult.isFailure) throw new AppErrorException(staleResult.getError());
          types = staleResult.getValue();
        }

        const r = await deps.PolicyAcceptanceService.accept(userId, types, ip);
        if (r.isFailure) throw new AppErrorException(r.getError());

        const status = await deps.PolicyAcceptanceService.getStatus(userId);
        if (status.isFailure) throw new AppErrorException(status.getError());

        return c.json(status.getValue());
      },
    )
    .get("/", g.requireAuth, async (c) => {
      const r = await deps.PolicyAcceptanceService.getStatus(g.currentUserId(c));
      if (r.isFailure) throw new AppErrorException(r.getError());

      return c.json(r.getValue());
    });
}
