import { AppErrorException, type IUseCase } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import type { UploadSettings } from "../../../../application/config/upload-settings";
import type { StorageError } from "../../../../application/ports/services/storage.port";
import type { IDownloadUrlQuery } from "../../../../application/queries/download-url.query";
import type {
  ConfirmUploadInput,
  ConfirmUploadOutput,
} from "../../../../application/usecases/confirm-upload/confirm-upload.dto";
import type {
  CreateUploadUrlInput,
  CreateUploadUrlOutput,
} from "../../../../application/usecases/create-upload-url/create-upload-url.dto";
import type {
  DeleteUploadInput,
  DeleteUploadOutput,
} from "../../../../application/usecases/delete-upload/delete-upload.dto";
import {
  confirmUploadBodySchema,
  deleteUploadBodySchema,
  presignDownloadBodySchema,
  presignUploadBodySchema,
} from "./uploads.schema";

export interface UploadsRoutesDeps {
  routeGuards: RouteGuards;
  uploadSettings: UploadSettings;
  CreateUploadUrlUseCase: IUseCase<CreateUploadUrlInput, CreateUploadUrlOutput, StorageError>;
  ConfirmUploadUseCase: IUseCase<ConfirmUploadInput, ConfirmUploadOutput, StorageError>;
  DeleteUploadUseCase: IUseCase<DeleteUploadInput, DeleteUploadOutput, StorageError>;
  IDownloadUrlQuery: IDownloadUrlQuery;
}

export function createUploadsRoutes(deps: UploadsRoutesDeps) {
  const { routeGuards: g } = deps;

  return new Hono<RouteEnv>()
    .post(
      "/presign",
      g.requireAuth,
      g.requireCurrentPolicies,
      g.denyImpersonated,
      zV("json", presignUploadBodySchema(deps.uploadSettings)),
      async (c) => {
        const result = await deps.CreateUploadUrlUseCase.execute({
          ownerId: g.currentUserId(c),
          ...c.req.valid("json"),
        });

        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json(result.getValue());
      },
    )
    .post(
      "/confirm",
      g.requireAuth,
      g.requireCurrentPolicies,
      g.denyImpersonated,
      zV("json", confirmUploadBodySchema),
      async (c) => {
        const result = await deps.ConfirmUploadUseCase.execute({
          ownerId: g.currentUserId(c),
          ...c.req.valid("json"),
        });

        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json(result.getValue());
      },
    )
    .post(
      "/download",
      g.requireAuth,
      g.requireCurrentPolicies,
      zV("json", presignDownloadBodySchema(deps.uploadSettings)),
      async (c) => {
        const result = await deps.IDownloadUrlQuery.execute({
          ownerId: g.currentUserId(c),
          ...c.req.valid("json"),
        });

        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json(result.getValue());
      },
    )
    .delete(
      "/",
      g.requireAuth,
      g.requireCurrentPolicies,
      g.denyImpersonated,
      zV("json", deleteUploadBodySchema),
      async (c) => {
        const result = await deps.DeleteUploadUseCase.execute({
          ownerId: g.currentUserId(c),
          ...c.req.valid("json"),
        });

        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json(result.getValue());
      },
    );
}
