import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { env } from "../../common/env";
import { type AuthVariables, requireAuth } from "../adapters/middleware/auth.middleware";
import type { StorageError } from "../application/ports/storage.port";
import { di } from "../di/container";

const SAFE_FILENAME = /^[\w\-. ]+$/;
const SAFE_SCOPE = /^[a-z][a-z0-9-]{0,31}$/;

const presignUploadBodySchema = z.object({
  filename: z.string().min(1).max(200).regex(SAFE_FILENAME),
  contentType: z.string().min(1).max(120),
  size: z.number().int().positive().max(env.STORAGE_MAX_UPLOAD_BYTES),
  scope: z.string().regex(SAFE_SCOPE).default("uploads"),
  expiresInSeconds: z
    .number()
    .int()
    .positive()
    .default(env.STORAGE_PRESIGN_TTL_MIN_SECONDS * 5),
});

const confirmUploadBodySchema = z.object({
  key: z.string().min(1).max(512),
  expectedSize: z.number().int().positive(),
  expectedContentType: z.string().min(1).max(120),
});

const presignDownloadBodySchema = z.object({
  key: z.string().min(1).max(512),
  expiresInSeconds: z
    .number()
    .int()
    .positive()
    .default(env.STORAGE_PRESIGN_TTL_MIN_SECONDS * 10),
});

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
