import { z } from "zod";
import { env } from "../../../common/env";

const SAFE_FILENAME = /^[\w\-. ]+$/;
const SAFE_SCOPE = /^[a-z][a-z0-9-]{0,31}$/;

export const presignUploadBodySchema = z.object({
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
