import { AppErrorException } from "@packages/ddd-kit";
import { idParamSchema } from "@packages/http/id-param";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import type { StripeReplayRule } from "../../../../application/ports/repositories/stripe-event.port";
import type { IListDeadLettersQuery } from "../../../../application/queries/list-dead-letters.query";
import type { IListStripeEventsQuery } from "../../../../application/queries/list-stripe-events.query";
import type { IListSweepRunsQuery } from "../../../../application/queries/list-sweep-runs.query";
import type { ReplayStripeEventUseCase } from "../../../../application/usecases/replay-stripe-event/replay-stripe-event.usecase";
import type { RequeueOutboxUseCase } from "../../../../application/usecases/requeue-outbox/requeue-outbox.usecase";
import type { AuthRequestHandler, StripeWebhookHandler } from "../../auth-request-handler";
import { requeueOutboxBodySchema } from "./ops.schema";

export interface AdminOpsRoutesDeps {
  routeGuards: RouteGuards;
  IAuthProvider: AuthRequestHandler;
  IListDeadLettersQuery: IListDeadLettersQuery;
  IListSweepRunsQuery: IListSweepRunsQuery;
  IListStripeEventsQuery: IListStripeEventsQuery;
  RequeueOutboxUseCase: Pick<RequeueOutboxUseCase, "execute">;
  ReplayStripeEventUseCase: Pick<ReplayStripeEventUseCase<StripeWebhookHandler>, "execute">;
  isReplayableStripeEvent: StripeReplayRule;
}

export function createAdminOpsRoutes(deps: AdminOpsRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .get("/dead-letters", g.requireAuth, g.requireStaffPermission("ops.read"), async (c) => {
      const result = await deps.IListDeadLettersQuery.execute();
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
        const result = await deps.RequeueOutboxUseCase.execute({
          actorUserId: g.currentUserId(c),
          ids: c.req.valid("json").ids,
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json(result.getValue());
      },
    )
    .get("/sweeps", g.requireAuth, g.requireStaffPermission("ops.read"), async (c) => {
      const result = await deps.IListSweepRunsQuery.execute();
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
      const result = await deps.IListStripeEventsQuery.execute();
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
          replayable: deps.isReplayableStripeEvent(row.type),
        })),
      });
    })
    .post(
      "/stripe-events/:id/replay",
      g.requireAuth,
      g.requireStaffPermission("ops.manage"),
      g.requireStepUp,
      zV("param", idParamSchema),
      async (c) => {
        const result = await deps.ReplayStripeEventUseCase.execute({
          actorUserId: g.currentUserId(c),
          stripeEventId: c.req.valid("param").id,
          handler: (request) => deps.IAuthProvider.handle(request),
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json({ ok: true });
      },
    );
}
