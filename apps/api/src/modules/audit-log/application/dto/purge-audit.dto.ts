import { z } from "zod";

export const purgeAuditBodySchema = z.object({
  olderThanDays: z.number().int().positive().default(90),
  dryRun: z.boolean().default(false),
});
