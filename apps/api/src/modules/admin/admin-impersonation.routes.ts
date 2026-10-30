import { type AppError, AppErrorException, type ErrorCode, Result } from "@packages/ddd-kit";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth } from "../../auth";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { resolveClientIp } from "../../shared/middleware/rate-limit.ip";
import { requireStaffPermission, requireStepUp } from "../../shared/middleware/staff.middleware";
import { zV } from "../../shared/validator";
import { impersonateBodySchema } from "./application/dto/impersonate.dto";
import { relaySetCookie } from "./relay-set-cookie";

const IMPERSONATION_TTL_SECONDS = 60 * 60;

function upstreamResult<Code extends ErrorCode>(
  upstream: Response,
  code: Code,
): Result<Response, AppError<Code>> {
  if (upstream.ok) return Result.ok(upstream);

  return Result.fail({ code, message: "The impersonation request was refused." });
}

export const adminImpersonationRoutes = new Hono<{ Variables: AuthVariables }>()
  .post(
    "/:id/start",
    requireAuth,
    requireStaffPermission("users.impersonate"),
    requireStepUp,
    zV("json", impersonateBodySchema),
    async (c) => {
      const actor = c.get("user");
      const targetId = c.req.param("id");
      if (actor.id === targetId) {
        throw new HTTPException(400, { message: "ADMIN_IMPERSONATION_SELF_FORBIDDEN" });
      }
      const { reason, ticketRef } = c.req.valid("json");

      const started = await di.AdminModerationService.startImpersonation(
        {
          actorUserId: actor.id,
          userId: targetId,
          reason,
          ticketRef,
          ip: resolveClientIp(c),
          expiresAt: new Date(Date.now() + IMPERSONATION_TTL_SECONDS * 1000).toISOString(),
        },
        async () =>
          upstreamResult(
            await auth.api.impersonateUser({
              body: { userId: targetId },
              headers: c.req.raw.headers,
              asResponse: true,
            }),
            "ADMIN_IMPERSONATION_FORBIDDEN",
          ),
      );
      if (started.isFailure) throw new AppErrorException(started.getError());

      return relaySetCookie(
        started.getValue(),
        c.json({ ok: true, expiresIn: IMPERSONATION_TTL_SECONDS }),
      );
    },
  )
  .post("/stop", requireAuth, async (c) => {
    const session = c.get("session");
    const impersonator = session.impersonatedBy;
    if (!impersonator) throw new HTTPException(400, { message: "ADMIN_NOT_IMPERSONATING" });

    const stopped = await di.AdminModerationService.stopImpersonation(
      {
        actorUserId: impersonator,
        userId: session.userId,
        durationMs: Date.now() - new Date(session.createdAt).getTime(),
      },
      async () =>
        upstreamResult(
          await auth.api.stopImpersonating({
            headers: c.req.raw.headers,
            asResponse: true,
          }),
          "ADMIN_STOP_IMPERSONATION_FORBIDDEN",
        ),
    );
    if (stopped.isFailure) throw new AppErrorException(stopped.getError());

    return relaySetCookie(stopped.getValue(), c.json({ ok: true }));
  });
