import { AppErrorException } from "@packages/ddd-kit";
import { idParamSchema } from "@packages/http/id-param";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import type { ApprovalRecord } from "../../../../application/ports/repositories/approval-store.port";
import type { IGetApprovalQuery } from "../../../../application/queries/get-approval.query";
import type { IListApprovalsQuery } from "../../../../application/queries/list-approvals.query";
import type { CancelApprovalUseCase } from "../../../../application/usecases/cancel-approval/cancel-approval.usecase";
import type { DecideApprovalUseCase } from "../../../../application/usecases/decide-approval/decide-approval.usecase";
import { APPROVAL_NOT_FOUND } from "../../../../domain/approval/approval-request.aggregate";
import { decideApprovalBodySchema, listApprovalsQuerySchema } from "./approvals.schema";

export interface AdminApprovalRoutesDeps {
  routeGuards: RouteGuards;
  IListApprovalsQuery: IListApprovalsQuery;
  IGetApprovalQuery: IGetApprovalQuery;
  DecideApprovalUseCase: Pick<DecideApprovalUseCase, "execute">;
  CancelApprovalUseCase: Pick<CancelApprovalUseCase, "execute">;
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
        const result = await deps.IListApprovalsQuery.execute(input);
        if (result.isFailure) throw new AppErrorException(result.getError());

        const { items, nextCursor } = result.getValue();

        return c.json({ items: items.map(serializeApproval), nextCursor: nextCursor.toNull() });
      },
    )
    .get(
      "/:id",
      g.requireAuth,
      g.requireStaffPermission("approvals.decide"),
      zV("param", idParamSchema),
      async (c) => {
        const result = await deps.IGetApprovalQuery.execute({
          approvalId: c.req.valid("param").id,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        const found = result.getValue();
        if (found.isNone()) throw new AppErrorException(APPROVAL_NOT_FOUND);

        return c.json(serializeApproval(found.unwrap()));
      },
    )
    .post(
      "/:id/decide",
      g.requireAuth,
      g.requireStaffPermission("approvals.decide"),
      g.requireStepUp,
      zV("json", decideApprovalBodySchema),
      zV("param", idParamSchema),
      async (c) => {
        const result = await deps.DecideApprovalUseCase.execute({
          approvalId: c.req.valid("param").id,
          deciderUserId: g.currentUserId(c),
          deciderPermissions: g.currentStaff(c).permissions,
          ...c.req.valid("json"),
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json({ ok: true });
      },
    )
    .post("/:id/cancel", g.requireAuth, g.requireStaff, zV("param", idParamSchema), async (c) => {
      const result = await deps.CancelApprovalUseCase.execute({
        approvalId: c.req.valid("param").id,
        userId: g.currentUserId(c),
      });
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json({ ok: true });
    });
}
