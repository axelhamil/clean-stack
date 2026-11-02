import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import {
  requireStaff,
  requireStaffPermission,
  requireStepUp,
} from "../../shared/middleware/staff.middleware";
import { zV } from "../../shared/validator";
import { decideApprovalBodySchema } from "./application/dto/decide-approval.dto";
import { listApprovalsQuerySchema } from "./application/dto/list-approvals.dto";
import type { ApprovalRecord } from "./application/ports/approval-store.port";

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

export const adminApprovalRoutes = new Hono<{ Variables: AuthVariables }>()
  .get(
    "/",
    requireAuth,
    requireStaffPermission("approvals.decide"),
    zV("query", listApprovalsQuerySchema),
    async (c) => {
      const input = c.req.valid("query");
      const result = await di.ApprovalService.list(input);
      if (result.isFailure) throw new AppErrorException(result.getError());

      const { items, nextCursor } = result.getValue();

      return c.json({ items: items.map(serializeApproval), nextCursor: nextCursor.toNull() });
    },
  )
  .get("/:id", requireAuth, requireStaffPermission("approvals.decide"), async (c) => {
    const result = await di.ApprovalService.get(c.req.param("id"));
    if (result.isFailure) throw new AppErrorException(result.getError());

    return c.json(serializeApproval(result.getValue()));
  })
  .post(
    "/:id/decide",
    requireAuth,
    requireStaffPermission("approvals.decide"),
    requireStepUp,
    zV("json", decideApprovalBodySchema),
    async (c) => {
      const result = await di.ApprovalService.decide({
        approvalId: c.req.param("id"),
        deciderUserId: c.get("user").id,
        deciderPermissions: c.get("staff").permissions,
        ...c.req.valid("json"),
      });
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json({ ok: true });
    },
  )
  .post("/:id/cancel", requireAuth, requireStaff, async (c) => {
    const result = await di.ApprovalService.cancel({
      approvalId: c.req.param("id"),
      userId: c.get("user").id,
    });
    if (result.isFailure) throw new AppErrorException(result.getError());

    return c.json({ ok: true });
  });
