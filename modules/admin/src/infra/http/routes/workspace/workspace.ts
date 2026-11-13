import { staffViewSchema } from "@packages/access-control";
import { AppErrorException } from "@packages/ddd-kit";
import { idParamSchema } from "@packages/http/id-param";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import type { IListSavedViewsQuery } from "../../../../application/queries/list-saved-views.query";
import type { IStaffInboxQuery } from "../../../../application/queries/staff-inbox.query";
import type { DeleteViewUseCase } from "../../../../application/usecases/delete-view/delete-view.usecase";
import type { SaveViewUseCase } from "../../../../application/usecases/save-view/save-view.usecase";

export interface AdminWorkspaceRoutesDeps {
  routeGuards: RouteGuards;
  IStaffInboxQuery: IStaffInboxQuery;
  IListSavedViewsQuery: IListSavedViewsQuery;
  SaveViewUseCase: Pick<SaveViewUseCase, "execute">;
  DeleteViewUseCase: Pick<DeleteViewUseCase, "execute">;
}

const SECTION_FAILED = { status: "failed" as const };

export function createAdminWorkspaceRoutes(deps: AdminWorkspaceRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .get("/inbox", g.requireAuth, g.requireStaff, async (c) => {
      const inbox = await deps.IStaffInboxQuery.execute({
        permissions: g.currentStaff(c).permissions,
      });
      if (inbox.isFailure) throw new AppErrorException(inbox.getError());

      const { approvals, queues, sweeps } = inbox.getValue();

      return c.json({
        approvals: approvals
          .map((read) => {
            if (read.isFailure) return SECTION_FAILED;

            const { total, items } = read.getValue();

            return {
              status: "ok" as const,
              total,
              items: items.map((item) => ({
                id: item.id,
                action: item.action,
                requestedBy: item.requestedBy,
                createdAt: item.createdAt.toISOString(),
              })),
            };
          })
          .toNull(),
        queues: queues
          .map((read) =>
            read.isFailure ? SECTION_FAILED : { status: "ok" as const, ...read.getValue() },
          )
          .toNull(),
        sweeps: sweeps
          .map((read) => {
            if (read.isFailure) return SECTION_FAILED;

            return {
              status: "ok" as const,
              items: read.getValue().map((run) => ({
                label: run.label,
                outcome: run.outcome,
                late: run.late,
                finishedAt: run.finishedAt.toISOString(),
              })),
            };
          })
          .toNull(),
      });
    })
    .get("/views", g.requireAuth, g.requireStaff, async (c) => {
      const result = await deps.IListSavedViewsQuery.execute({
        ownerId: g.currentUserId(c),
        permissions: g.currentStaff(c).permissions,
      });
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json({
        items: result.getValue(),
      });
    })
    .post("/views", g.requireAuth, g.requireStaff, zV("json", staffViewSchema), async (c) => {
      const result = await deps.SaveViewUseCase.execute({
        actorUserId: g.currentUserId(c),
        permissions: g.currentStaff(c).permissions,
        view: c.req.valid("json"),
      });
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json(result.getValue());
    })
    .delete("/views/:id", g.requireAuth, g.requireStaff, zV("param", idParamSchema), async (c) => {
      const result = await deps.DeleteViewUseCase.execute({
        actorUserId: g.currentUserId(c),
        viewId: c.req.valid("param").id,
      });
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json({ ok: true });
    });
}
