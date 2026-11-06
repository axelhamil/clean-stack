import { AppErrorException } from "@packages/ddd-kit";
import type { RouteEnv, RouteGuards } from "@packages/http/route-guards";
import { zV } from "@packages/http/validator";
import { Hono } from "hono";
import type { UploadSettings } from "./application/config/upload-settings";
import { confirmUploadBodySchema } from "./application/dto/confirm-upload.dto";
import { deleteUploadBodySchema } from "./application/dto/delete-upload.dto";
import { presignDownloadBodySchema } from "./application/dto/presign-download.dto";
import { presignUploadBodySchema } from "./application/dto/presign-upload.dto";
import type { UploadService } from "./application/services/upload.service";

export interface UploadsRoutesDeps {
  routeGuards: RouteGuards;
  uploadSettings: UploadSettings;
  UploadService: Pick<
    UploadService,
    "createUploadUrl" | "confirmUpload" | "createDownloadUrl" | "deleteUpload"
  >;
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
        const result = await deps.UploadService.createUploadUrl({
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
        const result = await deps.UploadService.confirmUpload({
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
        const result = await deps.UploadService.createDownloadUrl({
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
        const result = await deps.UploadService.deleteUpload({
          ownerId: g.currentUserId(c),
          ...c.req.valid("json"),
        });

        if (result.isFailure) throw new AppErrorException(result.getError());

        return c.json(result.getValue());
      },
    );
}
