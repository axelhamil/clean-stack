import { z } from "zod";
import { env } from "../../../../shared/env";
import { keySchema } from "./_key";

export const presignDownloadBodySchema = z.object({
  key: keySchema,
  expiresInSeconds: z
    .number()
    .int()
    .positive()
    .default((env.STORAGE_PRESIGN_TTL_MIN_SECONDS ?? 60) * 10),
});
