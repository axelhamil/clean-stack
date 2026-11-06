import { staffViewSchema } from "@packages/access-control";
import { AppErrorException } from "@packages/ddd-kit";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { requireStaff } from "../../shared/middleware/staff.middleware";

const SECTION_FAILED = { status: "failed" as const };

export const adminWorkspaceRoutes = new Hono<{ Variables: AuthVariables }>()
  .get("/inbox", requireAuth, requireStaff, async (c) => {
    const { approvals, queues, sweeps } = await di.InboxService.forStaff(
      c.get("staff").permissions,
    );

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
  .get("/views", requireAuth, requireStaff, async (c) => {
    const result = await di.SavedViewService.list({
      ownerId: c.get("user").id,
      permissions: c.get("staff").permissions,
    });
    if (result.isFailure) throw new AppErrorException(result.getError());

    return c.json({
      items: result.getValue(),
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
