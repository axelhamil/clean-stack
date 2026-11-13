import { AppErrorException } from "@packages/ddd-kit";
import { idParamSchema } from "@packages/http/id-param";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { IAuthProvider } from "../../../../application/ports/services/auth-provider.port";
import type { StartImpersonationUseCase } from "../../../../application/usecases/start-impersonation/start-impersonation.usecase";
import { impersonateBodySchema } from "./admin-impersonation.schema";
import { relaySetCookie } from "./relay-set-cookie";

export interface AdminImpersonationRoutesDeps {
  routeGuards: RouteGuards;
  IAuthProvider: Pick<
    IAuthProvider,
    "impersonationTtlSeconds" | "impersonateUser" | "stopImpersonating"
  >;
  StartImpersonationUseCase: Pick<StartImpersonationUseCase, "execute">;
}

export function createAdminImpersonationRoutes(deps: AdminImpersonationRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .post(
      "/:id/start",
      g.requireAuth,
      g.requireStaffPermission("users.impersonate"),
      g.requireStepUp,
      zV("json", impersonateBodySchema),
      zV("param", idParamSchema),
      async (c) => {
        const ttlSeconds = deps.IAuthProvider.impersonationTtlSeconds;
        const targetId = c.req.valid("param").id;
        const { reason, ticketRef } = c.req.valid("json");

        const started = await deps.StartImpersonationUseCase.execute({
          actorUserId: g.currentUserId(c),
          userId: targetId,
          reason,
          ticketRef,
          ip: g.clientIp(c),
          expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
          // raw-body: the auth library reads the session from the forwarded headers
          start: () => deps.IAuthProvider.impersonateUser(targetId, [...c.req.raw.headers]),
        });
        if (started.isFailure) throw new AppErrorException(started.getError());

        return relaySetCookie(started.getValue(), c.json({ ok: true, expiresIn: ttlSeconds }));
      },
    )
    .post("/stop", g.requireAuth, async (c) => {
      if (g.currentSession(c).impersonatedBy.isNone()) {
        throw new HTTPException(400, { message: "ADMIN_NOT_IMPERSONATING" });
      }

      // raw-body: the auth library reads the session from the forwarded headers
      const stopped = await deps.IAuthProvider.stopImpersonating([...c.req.raw.headers]);
      if (stopped.isFailure) throw new AppErrorException(stopped.getError());

      return relaySetCookie(stopped.getValue(), c.json({ ok: true }));
    });
}
