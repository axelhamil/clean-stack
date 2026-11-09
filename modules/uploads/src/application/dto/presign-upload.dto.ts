import { z } from "zod";
import type { UploadSettings } from "../config/upload-settings";

const SAFE_FILENAME = /^[\w\-. ]+$/;
const SAFE_SCOPE = /^[a-z][a-z0-9-]{0,31}$/;

export function presignUploadBodySchema(settings: UploadSettings) {
  return z.object({
    filename: z.string().min(1).max(200).regex(SAFE_FILENAME),
    contentType: z.string().min(1).max(120),
    size: z.number().int().positive().max(settings.maxUploadBytes),
    scope: z.string().regex(SAFE_SCOPE).default("uploads"),
    expiresInSeconds: z
      .number()
      .int()
      .positive()
      .default(settings.presignTtlMinSeconds * 5),
  });
}
