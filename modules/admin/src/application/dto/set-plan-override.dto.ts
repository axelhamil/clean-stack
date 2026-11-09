import { OVERRIDE_MAX_YEARS, PAID_TIERS } from "@packages/access-control";
import { z } from "zod";

function isWithinBound(value: string): boolean {
  const end = new Date(value).getTime();
  const now = new Date();
  const latest = Date.UTC(now.getUTCFullYear() + OVERRIDE_MAX_YEARS + 1, 0, 2);

  return end > now.getTime() && end < latest;
}

export const setPlanOverrideBodySchema = z.object({
  tier: z.enum(PAID_TIERS),
  expiresAt: z.iso.datetime().refine(isWithinBound),
  note: z.string().trim().min(1).max(1000),
});
