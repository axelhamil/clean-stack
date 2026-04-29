import { z } from "zod";
import { env } from "../../../common/env";

export const presignDownloadBodySchema = z.object({
  key: z.string().min(1).max(512),
  expiresInSeconds: z
    .number()
    .int()
    .positive()
    .default(env.STORAGE_PRESIGN_TTL_MIN_SECONDS * 10),
});

export type PresignDownloadInput = z.infer<typeof presignDownloadBodySchema>;
