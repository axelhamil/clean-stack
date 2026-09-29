import { z } from "zod";

export const setSsoEnforcementBodySchema = z.object({
  enforced: z.boolean(),
});
