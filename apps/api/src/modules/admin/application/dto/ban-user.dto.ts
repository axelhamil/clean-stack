import { z } from "zod";

const MAX_TIMED_BAN_SECONDS = 90 * 24 * 60 * 60;

export const banUserBodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
  expiresIn: z.number().int().positive().max(MAX_TIMED_BAN_SECONDS).optional(),
});
