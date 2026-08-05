import { z } from "zod";

export const banUserBodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
  expiresIn: z.number().int().positive().optional(),
});
