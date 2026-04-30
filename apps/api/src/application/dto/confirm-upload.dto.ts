import { z } from "zod";

export const confirmUploadBodySchema = z.object({
  key: z.string().min(1).max(512),
  expectedSize: z.number().int().positive(),
  expectedContentType: z.string().min(1).max(120),
});
