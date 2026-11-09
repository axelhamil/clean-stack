import { z } from "zod";
import type { UploadSettings } from "../config/upload-settings";
import { keySchema } from "./_key";

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
