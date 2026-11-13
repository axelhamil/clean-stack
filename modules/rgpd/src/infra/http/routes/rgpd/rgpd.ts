import { AppErrorException, type IUseCase } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuard, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import type { RgpdError } from "../../../../application/ports/repositories/deletion-state.port";
import type { StorageError } from "../../../../application/ports/services/export-storage.port";
import type { IPreflightAccountDeletionQuery } from "../../../../application/queries/preflight-account-deletion.query";
import type {
  CancelAccountDeletionInput,
  CancelAccountDeletionOutput,
} from "../../../../application/usecases/cancel-account-deletion/cancel-account-deletion.dto";
import type {
  RequestAccountDeletionInput,
  RequestAccountDeletionOutput,
} from "../../../../application/usecases/request-account-deletion/request-account-deletion.dto";
import type {
  RequestDataExportInput,
  RequestDataExportOutput,
} from "../../../../application/usecases/request-data-export/request-data-export.dto";
import { requestDeletionBodySchema } from "./rgpd.schema";

export interface RgpdRoutesDeps {
  routeGuards: RouteGuards;
  accountDeleteRateLimit: RouteGuard;
  RequestDataExportUseCase: IUseCase<
    RequestDataExportInput,
    RequestDataExportOutput,
    RgpdError | StorageError
  >;
  IPreflightAccountDeletionQuery: IPreflightAccountDeletionQuery;
  RequestAccountDeletionUseCase: IUseCase<
    RequestAccountDeletionInput,
    RequestAccountDeletionOutput,
    RgpdError
  >;
  CancelAccountDeletionUseCase: IUseCase<
    CancelAccountDeletionInput,
    CancelAccountDeletionOutput,
    RgpdError
  >;
}

export function createRgpdRoutes(deps: RgpdRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .post("/export", g.requireAuth, g.denyImpersonated, async (c) => {
      const result = await deps.RequestDataExportUseCase.execute({ userId: g.currentUserId(c) });
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    })
    .get("/delete/preflight", g.requireAuth, async (c) => {
      const result = await deps.IPreflightAccountDeletionQuery.execute({
        userId: g.currentUserId(c),
      });
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    })
    .post(
      "/delete",
      g.requireAuth,
      g.denyImpersonated,
      deps.accountDeleteRateLimit,
      zV("json", requestDeletionBodySchema),
      async (c) => {
        const result = await deps.RequestAccountDeletionUseCase.execute({
          userId: g.currentUserId(c),
          ...c.req.valid("json"),
        });
        if (result.isFailure) throw new AppErrorException(result.getError());
        return c.json(result.getValue());
      },
    )
    .delete("/delete", g.requireAuth, g.denyImpersonated, async (c) => {
      const result = await deps.CancelAccountDeletionUseCase.execute({
        userId: g.currentUserId(c),
      });
      if (result.isFailure) throw new AppErrorException(result.getError());
      return c.json(result.getValue());
    });
}
