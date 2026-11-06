import { AppErrorException } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { Hono } from "hono";
import { listAuditEventsQuerySchema } from "./application/dto/list-audit-events.dto";
import type { AuditQueryService } from "./application/services/audit-query.service";

export interface AuditLogRoutesDeps {
  routeGuards: RouteGuards;
  IOutboxRepository: IOutboxRepository;
  AuditQueryService: Pick<AuditQueryService, "listForPlatform" | "verifyChain">;
}

export function createAuditLogRoutes(deps: AuditLogRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .get(
      "/",
      g.requireAuth,
      g.requireStaffPermission("audit.read"),
      zV("query", listAuditEventsQuerySchema),
      async (c) => {
        const filters = c.req.valid("query");
        const result = await deps.AuditQueryService.listForPlatform(filters);
        if (result.isFailure) throw new AppErrorException(result.getError());

        if (!filters.cursor) {
          await emitEvent(
            deps.IOutboxRepository,
            EventTypes.SECURITY_OPERATOR_AUDIT_ACCESSED,
            "audit_log",
            "platform",
            {
              actorUserId: g.currentUserId(c),
              ip: g.clientIp(c),
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
        const page = result.getValue();
        return c.json({
          items: page.items.map((r) => ({
            ...r,
            actorId: r.actorId.toNull(),
            organizationId: r.organizationId.toNull(),
            prevHash: r.prevHash.toNull(),
            hash: r.hash.toNull(),
          })),
          nextCursor: page.nextCursor.toNull(),
        });
      },
    )
    .get("/verify", g.requireAuth, g.requireStaffPermission("audit.read"), async (c) => {
      const result = await deps.AuditQueryService.verifyChain();
      if (result.isFailure) throw new AppErrorException(result.getError());
      const v = result.getValue();
      return c.json({
        verified: v.verified,
        rowCount: v.rowCount,
        brokenAtId: v.brokenAtId.toNull(),
        brokenAtSequence: v.brokenAtSequence.toNull(),
      });
    });
}
