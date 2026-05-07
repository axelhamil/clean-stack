import { z } from "zod";

export const deleteUploadBodySchema = z.object({
  key: z.string().min(1).max(512),
});
