import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { requireCurrentPolicies } from "../../shared/middleware/policy.middleware";
import { zV } from "../../shared/validator";
import { confirmUploadBodySchema } from "./application/dto/confirm-upload.dto";
import { deleteUploadBodySchema } from "./application/dto/delete-upload.dto";
import { presignDownloadBodySchema } from "./application/dto/presign-download.dto";
import { presignUploadBodySchema } from "./application/dto/presign-upload.dto";

export const uploadsRoutes = new Hono<{ Variables: AuthVariables }>()
  .post(
    "/presign",
    requireAuth,
    requireCurrentPolicies,
    zV("json", presignUploadBodySchema),
    async (c) => {
      const result = await di.UploadService.createUploadUrl({
        ownerId: c.get("user").id,
        ...c.req.valid("json"),
      });

      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json(result.getValue());
    },
  )
  .post(
    "/confirm",
    requireAuth,
    requireCurrentPolicies,
    zV("json", confirmUploadBodySchema),
    async (c) => {
      const result = await di.UploadService.confirmUpload({
        ownerId: c.get("user").id,
        ...c.req.valid("json"),
      });

      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json(result.getValue());
    },
  )
  .post(
    "/download",
    requireAuth,
    requireCurrentPolicies,
    zV("json", presignDownloadBodySchema),
    async (c) => {
      const result = await di.UploadService.createDownloadUrl({
        ownerId: c.get("user").id,
        ...c.req.valid("json"),
      });

      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json(result.getValue());
    },
  )
  .delete(
    "/",
    requireAuth,
    requireCurrentPolicies,
    zV("json", deleteUploadBodySchema),
    async (c) => {
      const result = await di.UploadService.deleteUpload({
        ownerId: c.get("user").id,
        ...c.req.valid("json"),
      });

      if (result.isFailure) throw new AppErrorException(result.getError());

      return c.json(result.getValue());
    },
  );
