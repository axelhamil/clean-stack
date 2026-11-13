import { AppErrorException, type IUseCase, Option } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import type { PolicyError } from "../../../../application/ports/repositories/policy-acceptance.port";
import type { IPolicyStatusQuery } from "../../../../application/queries/policy-status.query";
import type {
  AcceptPoliciesInput,
  AcceptPoliciesOutput,
} from "../../../../application/usecases/accept-policies/accept-policies.dto";
import { presentPolicyStatus } from "./policies.presenter";
import { acceptPoliciesBodySchema } from "./policies.schema";

export interface PolicyRoutesDeps {
  routeGuards: RouteGuards;
  AcceptPoliciesUseCase: IUseCase<AcceptPoliciesInput, AcceptPoliciesOutput, PolicyError>;
  IPolicyStatusQuery: IPolicyStatusQuery;
}

export function createPolicyRoutes(deps: PolicyRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .post(
      "/accept",
      g.requireAuth,
      g.denyImpersonated,
      zV("json", acceptPoliciesBodySchema),
      async (c) => {
        const userId = g.currentUserId(c);
        const accepted = await deps.AcceptPoliciesUseCase.execute({
          userId,
          types: Option.fromNullable(c.req.valid("json").types),
          ipAddress: Option.some(g.clientIp(c)),
        });

        if (accepted.isFailure) throw new AppErrorException(accepted.getError());

        const status = await deps.IPolicyStatusQuery.execute({ userId });

        if (status.isFailure) throw new AppErrorException(status.getError());

        return c.json(presentPolicyStatus(status.getValue()));
      },
    )
    .get("/", g.requireAuth, async (c) => {
      const result = await deps.IPolicyStatusQuery.execute({ userId: g.currentUserId(c) });

      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json(presentPolicyStatus(result.getValue()));
    });
}
