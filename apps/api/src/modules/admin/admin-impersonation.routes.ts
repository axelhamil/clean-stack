import { EventTypes } from "@packages/events";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth } from "../../auth";
import { di } from "../../container";
import { emitEvent } from "../../shared/event-emitter";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { requirePlatformAdmin } from "../../shared/middleware/platform-admin.middleware";
import { resolveClientIp } from "../../shared/middleware/rate-limit.ip";
import { zV } from "../../shared/validator";
import { impersonateBodySchema } from "./application/dto/impersonate.dto";
import { relaySetCookie } from "./relay-set-cookie";

const IMPERSONATION_TTL_SECONDS = 60 * 60;

export const adminImpersonationRoutes = new Hono<{ Variables: AuthVariables }>()
  .post(
    "/:id/start",
    requireAuth,
    requirePlatformAdmin,
    zV("json", impersonateBodySchema),
    async (c) => {
      const actor = c.get("user");
      const targetId = c.req.param("id");
      if (actor.id === targetId) {
        throw new HTTPException(400, { message: "ADMIN_IMPERSONATION_SELF_FORBIDDEN" });
      }
      const { reason, ticketRef } = c.req.valid("json");

      const upstream = await auth.api.impersonateUser({
        body: { userId: targetId },
        headers: c.req.raw.headers,
        asResponse: true,
      });
      if (!upstream.ok) {
        throw new HTTPException(403, { message: "ADMIN_IMPERSONATION_REFUSED" });
      }

      await emitEvent(
        di.IOutboxRepository,
        EventTypes.ADMIN_IMPERSONATION_STARTED,
        "user",
        targetId,
        {
          actorUserId: actor.id,
          userId: targetId,
          reason,
          ticketRef,
          ip: resolveClientIp(c),
          expiresAt: new Date(Date.now() + IMPERSONATION_TTL_SECONDS * 1000).toISOString(),
        },
        {},
      );

      return relaySetCookie(upstream, c.json({ ok: true, expiresIn: IMPERSONATION_TTL_SECONDS }));
    },
  )
  .post("/stop", requireAuth, async (c) => {
    const session = c.get("session");
    const impersonator = session.impersonatedBy;
    if (!impersonator) throw new HTTPException(400, { message: "ADMIN_NOT_IMPERSONATING" });

    const upstream = await auth.api.stopImpersonating({
      headers: c.req.raw.headers,
      asResponse: true,
    });

    await emitEvent(
      di.IOutboxRepository,
      EventTypes.ADMIN_IMPERSONATION_STOPPED,
      "user",
      session.userId,
      {
        actorUserId: impersonator,
        userId: session.userId,
        durationMs: Date.now() - new Date(session.createdAt).getTime(),
      },
      {},
    );

    return relaySetCookie(upstream, c.json({ ok: true }));
  });
