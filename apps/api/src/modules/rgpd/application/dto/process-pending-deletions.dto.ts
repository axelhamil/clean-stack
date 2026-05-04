import { z } from "zod";

export const sweepBodySchema = z
  .object({
    batchSize: z.number().int().positive().max(500).optional(),
    dryRun: z.boolean().optional(),
  })
  .default({});
