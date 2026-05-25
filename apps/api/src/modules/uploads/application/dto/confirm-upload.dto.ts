import { z } from "zod";
import { keySchema } from "./_key";

export const confirmUploadBodySchema = z.object({
  key: keySchema,
  expectedSize: z.number().int().positive(),
  expectedContentType: z.string().min(1).max(120),
});
