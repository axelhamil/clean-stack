import { z } from "zod";

export const stepUpBodySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});
