import { z } from "zod";
import type { UploadSettings } from "../../../../application/config/upload-settings";
import { keySchema } from "../../../../application/services/upload-policy.service";

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

export const confirmUploadBodySchema = z.object({
  key: keySchema,
  expectedSize: z.number().int().positive(),
  expectedContentType: z.string().min(1).max(120),
});

export function presignDownloadBodySchema(settings: UploadSettings) {
  return z.object({
    key: keySchema,
    expiresInSeconds: z
      .number()
      .int()
      .positive()
      .default(settings.presignTtlMinSeconds * 10),
  });
}

export const deleteUploadBodySchema = z.union([
  z.object({ key: keySchema }),
  z.object({ url: z.url() }),
]);
