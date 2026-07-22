import { AppErrorException } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { Hono } from "hono";
import { di } from "../../container";
import { emitEvent } from "../../shared/event-emitter";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { requirePlatformAdmin } from "../../shared/middleware/platform-admin.middleware";
import { resolveClientIp } from "../../shared/middleware/rate-limit.ip";
import { zV } from "../../shared/validator";
import { listAuditEventsQuerySchema } from "./application/dto/list-audit-events.dto";

export const auditLogRoutes = new Hono<{ Variables: AuthVariables }>()
  .get(
    "/",
    requireAuth,
    requirePlatformAdmin,
    zV("query", listAuditEventsQuerySchema),
    async (c) => {
      const filters = c.req.valid("query");
      const result = await di.AuditQueryService.listForPlatform(filters);
      if (result.isFailure) throw new AppErrorException(result.getError());

      if (!filters.cursor) {
        const user = c.get("user");
        await emitEvent(
          di.IOutboxRepository,
          EventTypes.SECURITY_OPERATOR_AUDIT_ACCESSED,
          "audit_log",
          "platform",
          {
            actorUserId: user.id,
            ip: resolveClientIp(c),
            filters: {
              actorId: filters.actorId,
              actionPrefix: filters.actionPrefix,
              organizationId: filters.organizationId,
              occurredFrom: filters.occurredFrom?.toISOString(),
              occurredTo: filters.occurredTo?.toISOString(),
            },
          },
          {},
        );
      }
      return c.json(result.getValue());
    },
  )
  .get("/verify", requireAuth, requirePlatformAdmin, async (c) => {
    const result = await di.AuditQueryService.verifyChain();
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json(result.getValue());
  });
