import { z } from "zod";

export const requeueOutboxBodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
});
