import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { auth } from "../../auth";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { requireStaffPermission, requireStepUp } from "../../shared/middleware/staff.middleware";
import { zV } from "../../shared/validator";
import { requeueOutboxBodySchema } from "./application/dto/requeue-outbox.dto";

export const adminOpsRoutes = new Hono<{ Variables: AuthVariables }>()
  .get("/dead-letters", requireAuth, requireStaffPermission("ops.read"), async (c) => {
    const result = await di.OpsService.deadLetters();
    if (result.isFailure) throw new AppErrorException(result.getError());

    const { outbox, queues } = result.getValue();

    return c.json({
      outbox: {
        total: outbox.total,
        items: outbox.items.map((row) => ({
          ...row,
          occurredAt: row.occurredAt.toISOString(),
          deadAt: row.deadAt.toISOString(),
          lastError: row.lastError.toNull(),
          nextAttemptAt: row.nextAttemptAt.map((date) => date.toISOString()).toNull(),
        })),
      },
      queues,
    });
  })
  .post(
    "/outbox/requeue",
    requireAuth,
    requireStaffPermission("ops.manage"),
    requireStepUp,
    zV("json", requeueOutboxBodySchema),
    async (c) => {
      const result = await di.OpsService.requeue({
        actorUserId: c.get("user").id,
        ids: c.req.valid("json").ids,
      });
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json(result.getValue());
    },
  )
  .get("/sweeps", requireAuth, requireStaffPermission("ops.read"), async (c) => {
    const result = await di.OpsService.sweeps();
    if (result.isFailure) throw new AppErrorException(result.getError());

    return c.json({
      items: result.getValue().map((run) => ({
        ...run,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt.toISOString(),
      })),
    });
  })
  .get("/stripe-events", requireAuth, requireStaffPermission("ops.read"), async (c) => {
    const result = await di.OpsService.listStripeEvents();
    if (result.isFailure) throw new AppErrorException(result.getError());

    const { configured, items } = result.getValue();

    return c.json({
      configured,
      items: items.map((row) => ({
        id: row.id,
        type: row.type,
        status: row.status,
        receivedAt: row.receivedAt.toISOString(),
        lastError: row.lastError.toNull(),
        replayedAt: row.replayedAt.map((date) => date.toISOString()).toNull(),
      })),
    });
  })
  .post(
    "/stripe-events/:id/replay",
    requireAuth,
    requireStaffPermission("ops.manage"),
    requireStepUp,
    async (c) => {
      const result = await di.OpsService.replay({
        actorUserId: c.get("user").id,
        stripeEventId: c.req.param("id"),
        handler: (request) => auth.handler(request),
      });
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json({ ok: true });
    },
  );
