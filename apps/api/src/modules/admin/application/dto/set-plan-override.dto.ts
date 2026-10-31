import { z } from "zod";
import { TIERS } from "../../../../shared/entitlements";

export const setPlanOverrideBodySchema = z.object({
  tier: z.enum(TIERS),
  expiresAt: z.iso.datetime().refine((value) => new Date(value).getTime() > Date.now()),
  note: z.string().trim().min(1).max(1000),
});
