import { z } from "zod";

export const impersonateBodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
  ticketRef: z.string().trim().max(100).optional(),
});
