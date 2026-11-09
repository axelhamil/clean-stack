import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuard, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { requestDeletionBodySchema } from "../../application/dto/request-account-deletion.dto";
import type { RgpdService } from "../../application/services/rgpd.service";

export interface RgpdRoutesDeps {
  routeGuards: RouteGuards;
  accountDeleteRateLimit: RouteGuard;
  RgpdService: Pick<
    RgpdService,
    | "requestDataExport"
    | "preflightAccountDeletion"
    | "requestAccountDeletion"
    | "cancelAccountDeletion"
  >;
}

export function createRgpdRoutes(deps: RgpdRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .post("/export", g.requireAuth, g.denyImpersonated, async (c) => {
      const result = await deps.RgpdService.requestDataExport({
        userId: g.currentUserId(c),
      });
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    })
    .get("/delete/preflight", g.requireAuth, async (c) => {
      const result = await deps.RgpdService.preflightAccountDeletion({
        userId: g.currentUserId(c),
      });
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    })
    .post(
      "/delete",
      g.requireAuth,
      g.denyImpersonated,
      deps.accountDeleteRateLimit,
      zV("json", requestDeletionBodySchema),
      async (c) => {
        const result = await deps.RgpdService.requestAccountDeletion({
          userId: g.currentUserId(c),
          ...c.req.valid("json"),
        });
        if (result.isFailure) throw new AppErrorException(result.getError());
        return c.json(result.getValue());
      },
    )
    .delete("/delete", g.requireAuth, g.denyImpersonated, async (c) => {
      const result = await deps.RgpdService.cancelAccountDeletion({
        userId: g.currentUserId(c),
      });
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    });
}
