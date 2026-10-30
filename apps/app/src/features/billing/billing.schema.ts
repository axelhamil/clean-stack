import { z } from "zod";

export const billingSearchSchema = z.object({
  upgraded: z
    .union([z.literal(1), z.literal("1")])
    .optional()
    .catch(undefined),
});
