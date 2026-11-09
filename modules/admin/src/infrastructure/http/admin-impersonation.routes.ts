import { type AppError, AppErrorException, type ErrorCode, Result } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { impersonateBodySchema } from "../../application/dto/impersonate.dto";
import type { IAuthProvider } from "../../application/ports/auth-provider.port";
import type { AdminModerationService } from "../../application/services/admin-moderation.service";
import { relaySetCookie } from "./relay-set-cookie";

function upstreamResult<Code extends ErrorCode>(
  upstream: Response,
  code: Code,
): Result<Response, AppError<Code>> {
  if (upstream.ok) return Result.ok(upstream);

  return Result.fail({ code, message: "The impersonation request was refused." });
}

export interface AdminImpersonationRoutesDeps {
  routeGuards: RouteGuards;
  IAuthProvider: Pick<
    IAuthProvider,
    "impersonationTtlSeconds" | "impersonateUser" | "stopImpersonating"
  >;
  AdminModerationService: Pick<AdminModerationService, "startImpersonation">;
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
      async (c) => {
        const ttlSeconds = deps.IAuthProvider.impersonationTtlSeconds;
        const targetId = c.req.param("id");
        const { reason, ticketRef } = c.req.valid("json");

        const started = await deps.AdminModerationService.startImpersonation(
          {
            actorUserId: g.currentUserId(c),
            userId: targetId,
            reason,
            ticketRef,
            ip: g.clientIp(c),
            expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
          },
          async () =>
            upstreamResult(
              await deps.IAuthProvider.impersonateUser(targetId, c.req.raw.headers),
              "ADMIN_IMPERSONATION_FORBIDDEN",
            ),
        );
        if (started.isFailure) throw new AppErrorException(started.getError());

        return relaySetCookie(started.getValue(), c.json({ ok: true, expiresIn: ttlSeconds }));
      },
    )
    .post("/stop", g.requireAuth, async (c) => {
      if (g.currentSession(c).impersonatedBy.isNone()) {
        throw new HTTPException(400, { message: "ADMIN_NOT_IMPERSONATING" });
      }

      const stopped = upstreamResult(
        await deps.IAuthProvider.stopImpersonating(c.req.raw.headers),
        "ADMIN_STOP_IMPERSONATION_FORBIDDEN",
      );
      if (stopped.isFailure) throw new AppErrorException(stopped.getError());

      return relaySetCookie(stopped.getValue(), c.json({ ok: true }));
    });
}
