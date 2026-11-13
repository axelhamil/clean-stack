import { PAID_TIERS } from "@packages/access-control";
import { timeIdCursorSchema } from "@packages/http/time-id-cursor";
import { z } from "zod";
import { isOverrideExpiryWithinBound } from "../../../../application/services/plan-override-policy.service";

export const listOrgsQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  cursor: timeIdCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const setPlanOverrideBodySchema = z.object({
  tier: z.enum(PAID_TIERS),
  expiresAt: z.iso.datetime().refine(isOverrideExpiryWithinBound),
  note: z.string().trim().min(1).max(1000),
});

export const setSsoEnforcementBodySchema = z.object({
  enforced: z.boolean(),
});
