import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import { isReplayableStripeEvent } from "../../shared/ports/stripe-event.port";
import { requeueOutboxBodySchema } from "./application/dto/requeue-outbox.dto";
import type { IAuthProvider } from "./application/ports/auth-provider.port";
import type { OpsService } from "./application/services/ops.service";
import type { StripeReplayService } from "./application/services/stripe-replay.service";

export interface AdminOpsRoutesDeps {
  routeGuards: RouteGuards;
  IAuthProvider: Pick<IAuthProvider, "handle">;
  OpsService: Pick<OpsService, "deadLetters" | "requeue" | "sweeps">;
  StripeReplayService: Pick<StripeReplayService, "list" | "replay">;
}

export function createAdminOpsRoutes(deps: AdminOpsRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .get("/dead-letters", g.requireAuth, g.requireStaffPermission("ops.read"), async (c) => {
      const result = await deps.OpsService.deadLetters();
      if (result.isFailure) throw new AppErrorException(result.getError());

      const { outbox, queues } = result.getValue();

      return c.json({
        outbox: {
          total: outbox.total,
          items: outbox.items.map((row) => ({
            id: row.id,
            eventType: row.eventType,
            attempts: row.attempts,
            deadAt: row.deadAt.toISOString(),
            lastError: row.lastError.toNull(),
          })),
        },
        queues,
      });
    })
    .post(
      "/outbox/requeue",
      g.requireAuth,
      g.requireStaffPermission("ops.manage"),
      g.requireStepUp,
      zV("json", requeueOutboxBodySchema),
      async (c) => {
        const result = await deps.OpsService.requeue({
          actorUserId: g.currentUserId(c),
          ids: c.req.valid("json").ids,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json(result.getValue());
      },
    )
    .get("/sweeps", g.requireAuth, g.requireStaffPermission("ops.read"), async (c) => {
      const result = await deps.OpsService.sweeps();
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json({
        items: result.getValue().map((run) => ({
          label: run.label,
          outcome: run.outcome,
          count: run.count,
          late: run.late,
          finishedAt: run.finishedAt.toISOString(),
        })),
      });
    })
    .get("/stripe-events", g.requireAuth, g.requireStaffPermission("ops.read"), async (c) => {
      const result = await deps.StripeReplayService.list();
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
          replayable: isReplayableStripeEvent(row.type),
        })),
      });
    })
    .post(
      "/stripe-events/:id/replay",
      g.requireAuth,
      g.requireStaffPermission("ops.manage"),
      g.requireStepUp,
      async (c) => {
        const result = await deps.StripeReplayService.replay({
          actorUserId: g.currentUserId(c),
          stripeEventId: c.req.param("id"),
          handler: (request) => deps.IAuthProvider.handle(request),
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json({ ok: true });
      },
    );
}
