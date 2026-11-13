import { AppErrorException, type IUseCase } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import type { AuditError } from "../../../../application/ports/repositories/audit-log.port";
import type { AuditPage } from "../../../../application/queries/list-audit-events.query";
import type { IVerifyAuditChainQuery } from "../../../../application/queries/verify-audit-chain.query";
import type { ListAuditEventsInput } from "../../../../application/usecases/list-audit-events/list-audit-events.dto";
import { toAuditPageJson, toChainVerificationJson } from "./audit-log.presenter";
import { listAuditEventsQuerySchema } from "./audit-log.schema";

export interface AuditLogRoutesDeps {
  routeGuards: RouteGuards;
  ListAuditEventsUseCase: IUseCase<ListAuditEventsInput, AuditPage, AuditError>;
  IVerifyAuditChainQuery: IVerifyAuditChainQuery;
}

export function createAuditLogRoutes(deps: AuditLogRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .get(
      "/",
      g.requireAuth,
      g.requireStaffPermission("audit.read"),
      zV("query", listAuditEventsQuerySchema),
      async (c) => {
        const result = await deps.ListAuditEventsUseCase.execute({
          filters: c.req.valid("query"),
          actorUserId: g.currentUserId(c),
          ip: g.clientIp(c),
        });
        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json(toAuditPageJson(result.getValue()));
      },
    )
    .get("/verify", g.requireAuth, g.requireStaffPermission("audit.read"), async (c) => {
      const result = await deps.IVerifyAuditChainQuery.execute();
      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json(toChainVerificationJson(result.getValue()));
    });
}
