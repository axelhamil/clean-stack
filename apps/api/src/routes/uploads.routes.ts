import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { type AuthVariables, requireAuth } from "../adapters/middleware/auth.middleware";
import { confirmUploadBodySchema } from "../application/dto/confirm-upload.dto";
import { presignDownloadBodySchema } from "../application/dto/presign-download.dto";
import { presignUploadBodySchema } from "../application/dto/presign-upload.dto";
import type { StorageError } from "../application/ports/storage.port";
import { di } from "../di/container";

function statusFor(error: StorageError): 403 | 404 | 422 | 502 {
  switch (error.code) {
    case "STORAGE_FORBIDDEN":
      return 403;
    case "STORAGE_NOT_FOUND":
      return 404;
    case "STORAGE_INTEGRITY_FAILED":
      return 422;
    case "STORAGE_PROVIDER_FAILURE":
      return 502;
  }
}

export const uploadsRoutes = new Hono<{ Variables: AuthVariables }>()
  .post("/presign", requireAuth, zValidator("json", presignUploadBodySchema), async (c) => {
    const user = c.get("user");
    const result = await di.CreateUploadUrlUseCase.execute({
      ownerId: user.id,
      ...c.req.valid("json"),
    });

    if (result.isFailure) {
      const error = result.getError();
      throw new HTTPException(statusFor(error), { message: error.message });
    }
    return c.json(result.getValue());
  })
  .post("/confirm", requireAuth, zValidator("json", confirmUploadBodySchema), async (c) => {
    const user = c.get("user");
    const result = await di.ConfirmUploadUseCase.execute({
      ownerId: user.id,
      ...c.req.valid("json"),
    });

    if (result.isFailure) {
      const error = result.getError();
      throw new HTTPException(statusFor(error), { message: error.message });
    }
    return c.json(result.getValue());
  })
  .post("/download", requireAuth, zValidator("json", presignDownloadBodySchema), async (c) => {
    const user = c.get("user");
    const result = await di.CreateDownloadUrlUseCase.execute({
      ownerId: user.id,
      ...c.req.valid("json"),
    });

    if (result.isFailure) {
      const error = result.getError();
      throw new HTTPException(statusFor(error), { message: error.message });
    }
    return c.json(result.getValue());
  });
