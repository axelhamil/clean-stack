import { idParamSchema, idSchema } from "@packages/http/id-param";
import { z } from "zod";
import {
  overrideParamsSchema,
  roleChangeParamsSchema,
} from "../../../../application/approved-action";

export const stepUpBodySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

export const staffOverrideParamSchema = idParamSchema.and(z.object({ overrideId: idSchema }));

export const setStaffRoleBodySchema = roleChangeParamsSchema;

export const setStaffOverrideBodySchema = overrideParamsSchema;
