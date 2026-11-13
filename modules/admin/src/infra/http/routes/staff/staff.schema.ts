import { idParamSchema, idSchema } from "@packages/http/id-param";
import { z } from "zod";

export const stepUpBodySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

export const staffOverrideParamSchema = idParamSchema.and(z.object({ overrideId: idSchema }));
