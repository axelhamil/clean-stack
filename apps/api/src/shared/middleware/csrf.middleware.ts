import { AppErrorException } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { emitEvent } from "../event-emitter";
import { logger } from "../logger";
import type { IOutboxRepository } from "../ports/outbox.port";
import { resolveClientIp } from "./rate-limit.ip";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface CsrfDeps {
  outbox?: IOutboxRepository;
  allowedOrigins: string[];
}

type CsrfRejectReason = "missing_origin" | "origin_mismatch";

export function requireCsrf(deps: CsrfDeps) {
  if (!deps.outbox) {
    logger.warn({}, "csrf: no outbox provided — security events silently disabled");
  }
  return createMiddleware(async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next();
    // Bearer-authenticated clients (Capacitor mobile) carry no ambient cookie, so CSRF
    // does not apply; a forged cross-origin request cannot set Authorization without a
    // CORS preflight, which our cors() blocks for non-allowlisted origins.
    if (c.req.header("Authorization")?.startsWith("Bearer ")) return next();
    const origin = c.req.header("Origin");
    if (origin !== undefined && origin !== "null" && deps.allowedOrigins.includes(origin)) {
      return next();
    }
    const reason: CsrfRejectReason =
      origin === undefined || origin === "null" ? "missing_origin" : "origin_mismatch";
    if (deps.outbox) await emitCsrfRejected(deps.outbox, c, reason, origin);
    // reason stays in the emitted audit event, not the client response — no security-decision leak.
    throw new AppErrorException({
      code: "SECURITY_CSRF_FORBIDDEN",
      message: "CSRF check failed",
    });
  });
}

async function emitCsrfRejected(
  outbox: IOutboxRepository,
  c: Context,
  reason: CsrfRejectReason,
  origin: string | undefined,
): Promise<void> {
  const user = c.get("user") as { id: string } | null | undefined;
  const ip = resolveClientIp(c).slice(0, 45);
  try {
    await emitEvent(outbox, EventTypes.SECURITY_CSRF_REJECTED, "csrf", ip, {
      actorUserId: user?.id ?? null,
      ip,
      method: c.req.method.slice(0, 16),
      path: c.req.path.slice(0, 512),
      origin: origin === undefined || origin === "null" ? null : origin.slice(0, 2048),
      reason,
    });
  } catch (emitErr) {
    logger.warn({ err: emitErr }, "csrf event emit failed — still rejecting");
  }
}
