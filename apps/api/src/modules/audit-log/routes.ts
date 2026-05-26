import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { requireOrg, requireOrgPermission } from "../../shared/middleware/org.middleware";
import { zV } from "../../shared/validator";
import { listAuditEventsQuerySchema } from "./application/dto/list-audit-events.dto";

export const auditLogRoutes = new Hono<{ Variables: AuthVariables & { orgId: string } }>().get(
  "/",
  requireAuth,
  requireOrg,
  requireOrgPermission({ auditLog: ["read"] }),
  zV("query", listAuditEventsQuerySchema),
  async (c) => {
    const orgId = c.get("orgId");
    const filters = c.req.valid("query");
    const result = await di.AuditQueryService.listForOrg(orgId, {
      actorId: filters.actorId,
      targetType: filters.targetType,
      targetId: filters.targetId,
      actionPrefix: filters.actionPrefix,
      occurredFrom: filters.occurredFrom,
      occurredTo: filters.occurredTo,
      limit: filters.limit,
      cursor: filters.cursor,
    });
    if (result.isFailure) throw new AppErrorException(result.getError());
    return c.json(result.getValue());
  },
);
