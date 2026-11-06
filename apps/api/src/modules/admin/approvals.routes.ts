import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { decideApprovalBodySchema } from "./application/dto/decide-approval.dto";
import { listApprovalsQuerySchema } from "./application/dto/list-approvals.dto";
import type { ApprovalRecord } from "./application/ports/approval-store.port";
import type { ApprovalService } from "./application/services/approval.service";

export interface AdminApprovalRoutesDeps {
  routeGuards: RouteGuards;
  ApprovalService: Pick<ApprovalService, "list" | "get" | "decide" | "cancel">;
}

function serializeApproval(record: ApprovalRecord) {
  return {
    id: record.id,
    action: record.action,
    subjectId: record.subjectId,
    params: record.params,
    requestedBy: record.requestedBy,
    status: record.status,
    decidedBy: record.decidedBy.toNull(),
    decisionNote: record.decisionNote.toNull(),
    failureReason: record.failureReason.toNull(),
    expiresAt: record.expiresAt.toISOString(),
    decidedAt: record.decidedAt.map((date) => date.toISOString()).toNull(),
    createdAt: record.createdAt.toISOString(),
    version: record.version,
  };
}

export function createAdminApprovalRoutes(deps: AdminApprovalRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .get(
      "/",
      g.requireAuth,
      g.requireStaffPermission("approvals.decide"),
      zV("query", listApprovalsQuerySchema),
      async (c) => {
        const input = c.req.valid("query");
        const result = await deps.ApprovalService.list(input);
        if (result.isFailure) throw new AppErrorException(result.getError());

        const { items, nextCursor } = result.getValue();

        return c.json({ items: items.map(serializeApproval), nextCursor: nextCursor.toNull() });
      },
    )
    .get("/:id", g.requireAuth, g.requireStaffPermission("approvals.decide"), async (c) => {
      const result = await deps.ApprovalService.get(c.req.param("id"));
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json(serializeApproval(result.getValue()));
    })
    .post(
      "/:id/decide",
      g.requireAuth,
      g.requireStaffPermission("approvals.decide"),
      g.requireStepUp,
      zV("json", decideApprovalBodySchema),
      async (c) => {
        const result = await deps.ApprovalService.decide({
          approvalId: c.req.param("id"),
          deciderUserId: g.currentUserId(c),
          deciderPermissions: g.currentStaff(c).permissions,
          ...c.req.valid("json"),
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json({ ok: true });
      },
    )
    .post("/:id/cancel", g.requireAuth, g.requireStaff, async (c) => {
      const result = await deps.ApprovalService.cancel({
        approvalId: c.req.param("id"),
        userId: g.currentUserId(c),
      });
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json({ ok: true });
    });
}
