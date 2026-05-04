import { zValidator } from "@hono/zod-validator";
import { AppErrorException } from "@packages/ddd-kit";
import { Hono } from "hono";
import { di } from "../../container";
import { type AuthVariables, requireAuth } from "../../shared/middleware/auth.middleware";
import { confirmUploadBodySchema } from "./application/dto/confirm-upload.dto";
import { presignDownloadBodySchema } from "./application/dto/presign-download.dto";
import { presignUploadBodySchema } from "./application/dto/presign-upload.dto";

export const uploadsRoutes = new Hono<{ Variables: AuthVariables }>()
  .post("/presign", requireAuth, zValidator("json", presignUploadBodySchema), async (c) => {
    const result = await di.UploadService.createUploadUrl({
      ownerId: c.get("user").id,
      ...c.req.valid("json"),
    });

    if (result.isFailure) throw new AppErrorException(result.getError());

    return c.json(result.getValue());
  })
  .post("/confirm", requireAuth, zValidator("json", confirmUploadBodySchema), async (c) => {
    const result = await di.UploadService.confirmUpload({
      ownerId: c.get("user").id,
      ...c.req.valid("json"),
    });

    if (result.isFailure) throw new AppErrorException(result.getError());

    return c.json(result.getValue());
  })
  .post("/download", requireAuth, zValidator("json", presignDownloadBodySchema), async (c) => {
    const result = await di.UploadService.createDownloadUrl({
      ownerId: c.get("user").id,
      ...c.req.valid("json"),
    });

    if (result.isFailure) throw new AppErrorException(result.getError());

    return c.json(result.getValue());
  });
