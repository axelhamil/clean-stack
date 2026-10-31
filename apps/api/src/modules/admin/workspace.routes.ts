import { staffViewSchema } from "@packages/access-control";
import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { requireStaff } from "../../shared/middleware/staff.middleware";
import { zV } from "../../shared/validator";

export const adminWorkspaceRoutes = new Hono<{ Variables: AuthVariables }>()
  .get("/inbox", requireAuth, requireStaff, async (c) => {
    const result = await di.InboxService.forStaff(c.get("staff").permissions);
    if (result.isFailure) throw new AppErrorException(result.getError());

    const { approvals, operations } = result.getValue();

    return c.json({
      approvals: approvals
        .map(({ total, items }) => ({
          total,
          items: items.map((item) => ({
            id: item.id,
            action: item.action,
            requestedBy: item.requestedBy,
            createdAt: item.createdAt.toISOString(),
          })),
        }))
        .toNull(),
      operations: operations
        .map(({ failedSweeps, ...counts }) => ({
          ...counts,
          failedSweeps: failedSweeps.map((run) => ({
            label: run.label,
            outcome: run.outcome,
            finishedAt: run.finishedAt.toISOString(),
          })),
        }))
        .toNull(),
    });
  })
  .get("/views", requireAuth, requireStaff, async (c) => {
    const result = await di.SavedViewService.list({
      ownerId: c.get("user").id,
      permissions: c.get("staff").permissions,
    });
    if (result.isFailure) throw new AppErrorException(result.getError());

    return c.json({
      items: result.getValue().map((view) => ({
        ...view,
        updatedAt: view.updatedAt.toISOString(),
      })),
    });
  })
  .post("/views", requireAuth, requireStaff, zV("json", staffViewSchema), async (c) => {
    const result = await di.SavedViewService.save({
      actorUserId: c.get("user").id,
      permissions: c.get("staff").permissions,
      view: c.req.valid("json"),
    });
    if (result.isFailure) throw new AppErrorException(result.getError());

    return c.json(result.getValue());
  })
  .delete("/views/:id", requireAuth, requireStaff, async (c) => {
    const result = await di.SavedViewService.remove({
      actorUserId: c.get("user").id,
      viewId: c.req.param("id"),
    });
    if (result.isFailure) throw new AppErrorException(result.getError());

    return c.json({ ok: true });
  });
