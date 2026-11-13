import { AppErrorException, type IUseCase } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import type { ProfileError } from "../../../../application/ports/repositories/profile.port";
import type { SetLocaleInput } from "../../../../application/usecases/set-locale/set-locale.dto";
import { localeBodySchema } from "./profile.schema";

export interface ProfileRoutesDeps {
  routeGuards: RouteGuards;
  SetLocaleUseCase: IUseCase<SetLocaleInput, void, ProfileError>;
}

export function createProfileRoutes(deps: ProfileRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>().put(
    "/locale",
    g.requireAuth,
    g.requireCurrentPolicies,
    g.denyImpersonated,
    zV("json", localeBodySchema),
    async (c) => {
      const result = await deps.SetLocaleUseCase.execute({
        userId: g.currentUserId(c),
        ...c.req.valid("json"),
      });

      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json({ ok: true as const });
    },
  );
}
